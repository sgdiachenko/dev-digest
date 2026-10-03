/**
 * Project Context attachments — HTTP + real Postgres (Testcontainers), with a MockGitClient
 * serving the tree/blobs so no real clone is needed. Gated on Docker like the other
 * `*.it.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AgentContextView, ContextCatalog, GitTreeEntry, SkillContextView } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient } from '../src/adapters/mocks.js';
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

d('context attachments routes (Testcontainers pg)', () => {
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

  const tree = [entry('README.md', 1, 5), entry('docs/a.md', 2, 5), entry('docs/b.md', 3, 5)];
  const blobs = { [OID(1)]: 'readme text', [OID(2)]: 'doc a text', [OID(3)]: 'doc b text' };

  async function insertRepo(ws = workspaceId) {
    const name = `att-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}`, clonePath: '/mock/clone' })
      .returning();
    return repo!;
  }

  const makeApp = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient({ head: 'a'.repeat(40), tree, blobs }) },
    });

  async function scanned(app: FastifyInstance, repoId: string): Promise<ContextCatalog> {
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
      const body = res.json() as ContextCatalog;
      if (body.status !== 'scanning') return body;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('catalog stayed in scanning');
  }

  async function makeAgent(app: FastifyInstance) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `ctx-agent-${seq++}`, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function makeSkill(app: FastifyInstance) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `ctx-skill-${seq++}`, type: 'custom', body: 'Prefer small functions.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  const putAgent = (app: FastifyInstance, id: string, repoId: string, payload: unknown) =>
    app.inject({ method: 'PUT', url: `/agents/${id}/context?repo_id=${repoId}`, payload: payload as object });
  const docsBody = (...refs: [string, string][]) => ({ docs: refs.map(([repo_id, path]) => ({ repo_id, path })) });
  const agentVersion = async (app: FastifyInstance, id: string) =>
    ((await app.inject({ method: 'GET', url: `/agents/${id}` })).json() as { version: number }).version;

  it('GET of a fresh agent is empty; PUT saves an ordered list that GET returns (AC-3, AC-4)', async () => {
    const repo = await insertRepo();
    const app = await makeApp();
    await scanned(app, repo.id);
    const agentId = await makeAgent(app);

    const empty = await app.inject({ method: 'GET', url: `/agents/${agentId}/context?repo_id=${repo.id}` });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({ repo_id: repo.id, budget_tokens: 8000, own: [], inherited: [] });

    const put = await putAgent(app, agentId, repo.id, docsBody([repo.id, 'docs/b.md'], [repo.id, 'README.md']));
    expect(put.statusCode).toBe(200);
    const view = put.json() as AgentContextView;
    expect(view.own.map((x) => [x.path, x.position, x.status])).toEqual([
      ['docs/b.md', 0, 'ok'],
      ['README.md', 1, 'ok'],
    ]);

    const got = (await app.inject({ method: 'GET', url: `/agents/${agentId}/context?repo_id=${repo.id}` })).json();
    expect(got.own.map((x: { path: string }) => x.path)).toEqual(['docs/b.md', 'README.md']);
    await app.close();
  });

  it('a changed list bumps the agent version once; an identical PUT does not (AC-7); last PUT wins (EC-18)', async () => {
    const repo = await insertRepo();
    const app = await makeApp();
    await scanned(app, repo.id);
    const agentId = await makeAgent(app);
    const v1 = await agentVersion(app, agentId);

    await putAgent(app, agentId, repo.id, docsBody([repo.id, 'README.md']));
    expect(await agentVersion(app, agentId)).toBe(v1 + 1);
    await putAgent(app, agentId, repo.id, docsBody([repo.id, 'README.md']));
    expect(await agentVersion(app, agentId)).toBe(v1 + 1);

    await putAgent(app, agentId, repo.id, docsBody([repo.id, 'docs/a.md']));
    await putAgent(app, agentId, repo.id, docsBody([repo.id, 'docs/b.md']));
    const got = (await app.inject({ method: 'GET', url: `/agents/${agentId}/context?repo_id=${repo.id}` })).json();
    expect(got.own.map((x: { path: string }) => x.path)).toEqual(['docs/b.md']);
    await app.close();
  });

  it('PUT 422 matrix: duplicate, >20, unknown key, unknown path, foreign repo, bad query (AC-8, NFR-3)', async () => {
    const repo = await insertRepo();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const foreign = await insertRepo(otherWs!.id);
    const app = await makeApp();
    await scanned(app, repo.id);
    const agentId = await makeAgent(app);

    const tooMany = docsBody(...Array.from({ length: 21 }, (_, i): [string, string] => [repo.id, `d${i}.md`]));
    const cases: [string, unknown][] = [
      ['duplicate', docsBody([repo.id, 'README.md'], [repo.id, 'README.md'])],
      ['more than 20', tooMany],
      ['extra top-level key', { docs: [], extra: 1 }],
      ['extra item key', { docs: [{ repo_id: repo.id, path: 'README.md', x: 1 }] }],
      ['path not in catalog', docsBody([repo.id, 'nope.md'])],
      ['repo of another workspace', docsBody([foreign.id, 'README.md'])],
      ['repo_id not a uuid', { docs: [{ repo_id: 'x', path: 'README.md' }] }],
    ];
    for (const [label, payload] of cases) {
      const res = await putAgent(app, agentId, repo.id, payload);
      expect(res.statusCode, label).toBe(422);
    }
    const noQuery = await app.inject({ method: 'PUT', url: `/agents/${agentId}/context`, payload: { docs: [] } });
    expect(noQuery.statusCode).toBe(422);
    // nothing was written by any rejected request
    const got = (await app.inject({ method: 'GET', url: `/agents/${agentId}/context?repo_id=${repo.id}` })).json();
    expect(got.own).toEqual([]);
    await app.close();
  });

  it('404 for an agent or skill of another workspace; a foreign view repo reads as an empty index (AC-8 is a PUT rule, covered by the 422 matrix)', async () => {
    const repo = await insertRepo();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const [foreignAgent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: otherWs!.id, name: 'foreign', provider: 'openai', model: 'm', systemPrompt: 'x' })
      .returning();
    const foreignRepo = await insertRepo(otherWs!.id);
    const app = await makeApp();
    const agentId = await makeAgent(app);

    const get = await app.inject({ method: 'GET', url: `/agents/${foreignAgent!.id}/context?repo_id=${repo.id}` });
    expect(get.statusCode).toBe(404);
    expect((await putAgent(app, foreignAgent!.id, repo.id, docsBody())).statusCode).toBe(404);
    const unknownSkill = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/skills/${unknownSkill}/context?repo_id=${repo.id}` })).statusCode).toBe(404);
    const foreignView = await app.inject({ method: 'GET', url: `/agents/${agentId}/context?repo_id=${foreignRepo.id}` });
    // `loadCatalogs` treats a repo outside the workspace as an empty index (documented in
    // docs/api-contracts.md: only a PUT with a foreign `repo_id` is rejected, with 422): the view
    // is empty and leaks nothing of the other workspace.
    expect(foreignView.statusCode).toBe(200);
    expect(foreignView.json()).toMatchObject({ repo_id: foreignRepo.id, own: [], inherited: [] });
    await app.close();
  });

  it('skill attachments serialize, never change the skill version, and are inherited by agents (AC-9, AC-10, AC-11)', async () => {
    const repo = await insertRepo();
    const app = await makeApp();
    await scanned(app, repo.id);
    const skillId = await makeSkill(app);
    const agentId = await makeAgent(app);
    await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: [skillId] } });
    const skillBefore = (await app.inject({ method: 'GET', url: `/skills/${skillId}` })).json() as { version: number };

    const put = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}/context?repo_id=${repo.id}`,
      payload: docsBody([repo.id, 'docs/a.md']),
    });
    expect(put.statusCode).toBe(200);
    const view = put.json() as SkillContextView;
    expect(view.own.map((x) => x.path)).toEqual(['docs/a.md']);
    expect(view.serialized).toContain('### docs/a.md');
    expect(view.serialized).toContain('doc a text');

    const skillAfter = (await app.inject({ method: 'GET', url: `/skills/${skillId}` })).json() as { version: number };
    expect(skillAfter.version).toBe(skillBefore.version);

    const agentView = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/context?repo_id=${repo.id}` })
    ).json() as AgentContextView;
    expect(agentView.inherited.map((x) => [x.skill_id, x.path, x.skill_active, x.duplicate])).toEqual([
      [skillId, 'docs/a.md', true, false],
    ]);
    await app.close();
  });

  it('20 saves stay fast: p95 <= 300 ms (NFR-1)', async () => {
    const repo = await insertRepo();
    const app = await makeApp();
    await scanned(app, repo.id);
    const agentId = await makeAgent(app);
    const lists = [[[repo.id, 'README.md']], [[repo.id, 'docs/a.md'], [repo.id, 'docs/b.md']]] as [string, string][][];
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const started = performance.now();
      const res = await putAgent(app, agentId, repo.id, docsBody(...lists[i % 2]!));
      samples.push(performance.now() - started);
      expect(res.statusCode).toBe(200);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
    console.info(`[context-attachments] PUT p95 over 20 saves: ${p95.toFixed(1)} ms`);
    expect(p95).toBeLessThanOrEqual(300);
    await app.close();
  });
});
