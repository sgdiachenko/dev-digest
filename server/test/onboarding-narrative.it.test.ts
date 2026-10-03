/**
 * Onboarding tour narrative (B) — HTTP + real Postgres (Testcontainers), with a
 * MockGitClient, a stub repo-intel facade and a fake LLM provider. NOT run by the
 * implementer (needs Docker); gated like the other `*.it.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  GitTreeEntry,
  LLMProvider,
  NarrativeGenerateAccepted,
  Onboarding,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import type { IndexState, RepoIntel } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const SHA = 'a'.repeat(40);
const OID = (n: number) => n.toString(16).padStart(40, '0');
const entry = (path: string, n: number, size: number): GitTreeEntry => ({
  path,
  mode: '100644',
  type: 'blob',
  oid: OID(n),
  size,
});

const indexed = (): IndexState => ({
  repoId: 'x',
  status: 'full',
  filesIndexed: 2,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: SHA,
  indexerVersion: 1,
  updatedAt: new Date(1),
});

const intel = (): RepoIntel =>
  ({
    getIndexState: async () => indexed(),
    getGraphFacts: async () => ({ edges: [], ranks: [], fileFacts: [] }),
    getRepoMap: async () => ({ text: 'src/index.ts', tokens: 3, cached: false }),
  }) as unknown as RepoIntel;

/** Fake provider: answers after `release()` when gated, else immediately. */
function fakeLlm(gate?: Promise<void>) {
  const calls: StructuredRequest<unknown>[] = [];
  const llm = {
    id: 'openai',
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      calls.push(req as StructuredRequest<unknown>);
      if (gate) await gate;
      return {
        data: {
          architecture: null,
          critical_paths: [{ path: 'src/index.ts', description: 'Entry point' }],
          run_locally: null,
          reading_path: null,
          first_tasks: null,
        } as T,
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.01,
        raw: '',
        attempts: 1,
      };
    },
  } as unknown as LLMProvider;
  return { llm, calls };
}

d('onboarding tour narrative routes (Testcontainers pg)', () => {
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

  async function insertRepo(clonePath: string | null = '/mock/clone') {
    const name = `narr-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }

  const git = () =>
    new MockGitClient({
      tree: [entry('package.json', 1, 60), entry('src/index.ts', 2, 5)],
      blobs: { [OID(1)]: '{"name":"app","scripts":{"test":"vitest"}}', [OID(2)]: 'export {}' },
    });
  const appWith = (llm: LLMProvider) =>
    buildApp({ config: config(), db: pg.handle.db, overrides: { git: git(), repoIntel: intel(), llm: { openrouter: llm } } });
  const rows = (repoId: string) =>
    pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
  const until = async (fn: () => Promise<boolean>) => {
    for (let i = 0; i < 100; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('condition not reached');
  };

  it('POST -> 202, generation completes in the background and GET /tour shows it additively', async () => {
    const repo = await insertRepo();
    const { llm, calls } = fakeLlm();
    const app = await appWith(llm);
    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/tour/narrative` });
    expect(res.statusCode).toBe(202);
    expect((res.json() as NarrativeGenerateAccepted).status).toBe('accepted');

    await until(async () => {
      const body = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` })).json() as Onboarding;
      return body.narrative?.status === 'ready';
    });
    const tour = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` })).json() as Onboarding;
    expect(tour.sections).not.toBeNull(); // facts untouched
    expect(tour.estimated_cost).not.toBeNull();
    expect(tour.narrative).toMatchObject({ outdated: false, source_sha: SHA, provider: 'openrouter' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ maxRetries: 0, httpRetries: 0, requireStructuredProviders: true });
    await app.close();
  });

  it('a second POST while generating shares the run (already_running) with one LLM call', async () => {
    const repo = await insertRepo();
    let release!: () => void;
    const { llm, calls } = fakeLlm(new Promise<void>((r) => (release = r)));
    const app = await appWith(llm);
    const a = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/tour/narrative` })).json() as NarrativeGenerateAccepted;
    const b = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/tour/narrative` })).json() as NarrativeGenerateAccepted;
    expect(b).toMatchObject({ generation_id: a.generation_id, already_running: true });
    const tour = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` })).json() as Onboarding;
    expect(tour.narrative?.status).toBe('generating');
    release();
    await until(async () => (await rows(repo.id))[0]?.json != null && calls.length === 1);
    await app.close();
  });

  it('409 when the tour is unavailable, 404 unknown repo, 422 bad id', async () => {
    const noClone = await insertRepo(null);
    const app = await appWith(fakeLlm().llm);
    const a = await app.inject({ method: 'POST', url: `/repos/${noClone.id}/tour/narrative` });
    expect(a.statusCode).toBe(409);
    expect(a.json()).toEqual({ reason: 'tour_unavailable' });
    expect((await rows(noClone.id)).length).toBe(0);
    const b = await app.inject({ method: 'POST', url: '/repos/00000000-0000-4000-8000-000000000000/tour/narrative' });
    expect(b.statusCode).toBe(404);
    const c = await app.inject({ method: 'POST', url: '/repos/not-a-uuid/tour/narrative' });
    expect(c.statusCode).toBe(422);
    await app.close();
  });

  it('429 from the service limiter after 10 requests (works under NODE_ENV=test)', async () => {
    const repo = await insertRepo();
    const app = await appWith(fakeLlm().llm);
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/tour/narrative` })).statusCode;
    }
    expect(last).toBe(429);
    await app.close();
  });

  it('deleting the repo during a run leaves no onboarding row', async () => {
    const repo = await insertRepo();
    let release!: () => void;
    const { llm, calls } = fakeLlm(new Promise<void>((r) => (release = r)));
    const app = await appWith(llm);
    await app.inject({ method: 'POST', url: `/repos/${repo.id}/tour/narrative` });
    await until(async () => calls.length === 1);
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repo.id));
    release();
    await new Promise((r) => setTimeout(r, 200));
    expect((await rows(repo.id)).length).toBe(0);
    await app.close();
  });

  it('GET /tour alone (what a resync leads to) never creates a narrative row', async () => {
    const repo = await insertRepo();
    const { llm, calls } = fakeLlm();
    const app = await appWith(llm);
    const tour = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` })).json() as Onboarding;
    expect(tour.narrative).toBeNull();
    expect((await rows(repo.id)).length).toBe(0);
    expect(calls).toHaveLength(0);
    await app.close();
  });
});
