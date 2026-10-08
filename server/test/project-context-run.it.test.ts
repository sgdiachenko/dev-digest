/**
 * Project Context injection end to end — the real `POST /pulls/:id/review` route (the one the
 * MCP server uses), real Postgres (Testcontainers), MockGitClient serving tree + blobs at the
 * scanned sha, MockLLMProvider recording the prompt. Gated on Docker like the other
 * `*.it.test.ts` files; not run by the unit suite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ContextCatalog, GitTreeEntry, RunTrace, CompletionRequest } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const OID = (n: number) => n.toString(16).padStart(40, '0');
const entry = (path: string, n: number, size: number): GitTreeEntry => ({
  path,
  mode: '100644',
  type: 'blob',
  oid: OID(n),
  size,
});

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "x",
   redisUrl: x,`;
const REVIEW = { verdict: 'comment', summary: 'ok', score: 90, findings: [] };

d('project context in a run (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const SPEC_TEXT = 'Always validate input at the boundary.';
  const tree = [entry('docs/spec.md', 1, SPEC_TEXT.length), entry('docs/gone.md', 2, 4)];
  const blobs = { [OID(1)]: SPEC_TEXT, [OID(2)]: 'gone' };

  async function setup() {
    const name = `run-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: '/mock/clone' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'T',
        author: 'a',
        branch: 'f',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF, head: 'a'.repeat(40), tree, blobs }),
        llm: { openai: llm },
      },
    });
    return { repo: repo!, pr: pr!, llm, app };
  }

  async function scanned(app: FastifyInstance, repoId: string): Promise<ContextCatalog> {
    for (let i = 0; i < 100; i++) {
      const body = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context` })).json() as ContextCatalog;
      if (body.status !== 'scanning') return body;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('catalog stayed in scanning');
  }

  async function agentWith(app: FastifyInstance, repoId: string, paths: string[]) {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `pc-agent-${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
    });
    const id = created.json().id as string;
    if (paths.length > 0) {
      const put = await app.inject({
        method: 'PUT',
        url: `/agents/${id}/context?repo_id=${repoId}`,
        payload: { docs: paths.map((path) => ({ repo_id: repoId, path })) },
      });
      expect(put.statusCode).toBe(200);
    }
    return id;
  }

  async function runAgent(app: FastifyInstance, prId: string, agentId: string): Promise<RunTrace> {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBeLessThan(300);
    const runs = await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const trace = await app.inject({ method: 'GET', url: `/runs/${runs[0]!.id}/trace` });
    expect(trace.statusCode).toBe(200);
    return trace.json() as RunTrace;
  }

  const userMessage = (llm: MockLLMProvider) =>
    (llm.calls.find((c) => c.method === 'completeStructured')!.req as CompletionRequest).messages[1]!.content;

  it('injects the attached doc read from the scanned sha and persists project_context (AC-18, AC-30, AC-31)', async () => {
    const { repo, pr, llm, app } = await setup();
    await scanned(app, repo.id);
    const agentId = await agentWith(app, repo.id, ['docs/spec.md', 'docs/gone.md']);

    const trace = await runAgent(app, pr.id, agentId);

    expect(userMessage(llm)).toContain('## Project context');
    expect(userMessage(llm)).toContain(SPEC_TEXT);
    expect(trace.specs_read).toEqual(['docs/spec.md', 'docs/gone.md']);
    expect(trace.project_context?.sha).toBe('a'.repeat(40));
    expect(trace.project_context?.docs.map((x) => [x.path, x.status])).toEqual([
      ['docs/spec.md', 'injected'],
      ['docs/gone.md', 'injected'],
    ]);
    expect(trace.log.some((l) => l.msg.startsWith('Project context: 2 docs'))).toBe(true);
    await app.close();
  });

  it('an agent with nothing attached keeps a block-free prompt and a null project_context (NFR-8, AC-26)', async () => {
    const { repo, pr, llm, app } = await setup();
    await scanned(app, repo.id);
    const agentId = await agentWith(app, repo.id, []);

    const trace = await runAgent(app, pr.id, agentId);

    expect(userMessage(llm)).not.toContain('## Project context');
    expect(trace.specs_read).toEqual([]);
    expect(trace.project_context ?? null).toBeNull();
    expect(trace.log.some((l) => l.msg === 'Project context: 0 docs, ≈0 tokens')).toBe(true);
    await app.close();
  });

  it('a repo without a clone runs without the block and says why (AC-24)', async () => {
    const { repo, pr, llm, app } = await setup();
    await scanned(app, repo.id);
    const agentId = await agentWith(app, repo.id, ['docs/spec.md']);
    await pg.handle.db.update(t.repos).set({ clonePath: null }).where(eq(t.repos.id, repo.id));

    const trace = await runAgent(app, pr.id, agentId);

    expect(userMessage(llm)).not.toContain('## Project context');
    expect(trace.log.some((l) => l.msg.startsWith('Project context unavailable'))).toBe(true);
    await app.close();
  });
});
