/**
 * Project Context catalog — HTTP + real Postgres (Testcontainers), with a
 * MockGitClient serving the tree/blobs so no real clone is needed. Gated on
 * Docker like the other `*.it.test.ts` files.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ContextCatalog, ContextDocContent, GitTreeEntry } from '@devdigest/shared';
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
const entry = (path: string, n: number, size: number, mode = '100644'): GitTreeEntry => ({
  path,
  mode,
  type: 'blob',
  oid: OID(n),
  size,
});

d('project-context routes (Testcontainers pg)', () => {
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

  async function insertRepo(ws = workspaceId, clonePath: string | null = '/mock/clone') {
    const name = `ctx-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }

  const appWith = (git: MockGitClient) =>
    buildApp({ config: config(), db: pg.handle.db, overrides: { git } });

  async function getCatalog(app: FastifyInstance, repoId: string) {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    return { res, body: res.json() as ContextCatalog };
  }

  async function waitSettled(app: FastifyInstance, repoId: string): Promise<ContextCatalog> {
    for (let i = 0; i < 100; i++) {
      const { body } = await getCatalog(app, repoId);
      if (body.status !== 'scanning') return body;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('catalog stayed in scanning');
  }

  const baseTree = [
    entry('docs/b.md', 2, 5),
    entry('README.md', 1, 5),
    entry('big.md', 3, 70_000),
    entry('link.md', 4, 9, '120000'),
    entry('node_modules/x.md', 5, 3),
  ];
  const baseBlobs = { [OID(1)]: 'hello', [OID(2)]: 'world' };

  it('first GET -> scanning, then ready with files ordered by path; symlink/excluded absent', async () => {
    const repo = await insertRepo();
    const app = await appWith(new MockGitClient({ head: 'a'.repeat(40), tree: baseTree, blobs: baseBlobs }));
    const first = await getCatalog(app, repo.id);
    expect(first.res.statusCode).toBe(200);
    expect(first.body.status).toBe('scanning');

    const done = await waitSettled(app, repo.id);
    expect(done.status).toBe('ready');
    expect(done.scanned_sha).toBe('a'.repeat(40));
    expect(done.files.map((f) => f.path)).toEqual(['README.md', 'big.md', 'docs/b.md']);
    expect(done.files.find((f) => f.path === 'big.md')).toMatchObject({ status: 'too_large', est_tokens: null });
    expect(done.files.every((f) => f.used_by?.agents.length === 0 && f.used_by?.skills.length === 0)).toBe(true);
    await app.close();
  });

  it('preview: ok returns content, too_large returns null, unknown/traversal paths 404, empty path 422', async () => {
    const repo = await insertRepo();
    const app = await appWith(new MockGitClient({ head: 'a'.repeat(40), tree: baseTree, blobs: baseBlobs }));
    await getCatalog(app, repo.id);
    await waitSettled(app, repo.id);
    const file = (path: string) =>
      app.inject({ method: 'GET', url: `/repos/${repo.id}/context/file?path=${encodeURIComponent(path)}` });

    const ok = await file('README.md');
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as ContextDocContent).content).toBe('hello');
    expect(((await file('big.md')).json() as ContextDocContent).content).toBeNull();
    expect((await file('../x')).statusCode).toBe(404);
    expect((await file('link.md')).statusCode).toBe(404);
    expect((await file('nope.md')).statusCode).toBe(404);
    expect((await file('')).statusCode).toBe(422);
    await app.close();
  });

  it('foreign or unknown repo -> 404 on all three routes', async () => {
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const foreign = await insertRepo(otherWs!.id);
    const app = await appWith(new MockGitClient({ tree: baseTree, blobs: baseBlobs }));
    const unknown = '00000000-0000-0000-0000-000000000000';
    for (const id of [foreign.id, unknown]) {
      expect((await app.inject({ method: 'GET', url: `/repos/${id}/context` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: `/repos/${id}/context/file?path=README.md` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: `/repos/${id}/context/rescan` })).statusCode).toBe(404);
    }
    await app.close();
  });

  it('caps a 1200-document repo at 1000 with truncated + total_files', async () => {
    const repo = await insertRepo();
    const tree = Array.from({ length: 1200 }, (_, i) => entry(`d/${String(i).padStart(4, '0')}.md`, 100 + i, 0));
    const app = await appWith(new MockGitClient({ head: 'a'.repeat(40), tree }));
    await getCatalog(app, repo.id);
    const done = await waitSettled(app, repo.id);
    expect(done.files).toHaveLength(1000);
    expect(done.truncated).toBe(true);
    expect(done.total_files).toBe(1200);
    await app.close();
  });

  it('rescan -> 202, catalog moves to syncedHead; two POSTs share one sync', async () => {
    const repo = await insertRepo();
    const git = new MockGitClient({
      head: 'a'.repeat(40),
      syncedHead: 'b'.repeat(40),
      tree: baseTree,
      blobs: baseBlobs,
    });
    const app = await appWith(git);
    await getCatalog(app, repo.id);
    await waitSettled(app, repo.id);

    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: `/repos/${repo.id}/context/rescan` }),
      app.inject({ method: 'POST', url: `/repos/${repo.id}/context/rescan` }),
    ]);
    expect(r1.statusCode).toBe(202);
    expect(r1.json()).toEqual({ status: 'accepted', catalog_status: 'scanning' });
    expect(r2.statusCode).toBe(202);
    const done = await waitSettled(app, repo.id);
    expect(done.scanned_sha).toBe('b'.repeat(40));
    expect(git.syncs).toHaveLength(1);
    await app.close();
  });

  it('rescan with a failing sync -> error status, previous files kept', async () => {
    const repo = await insertRepo();
    const ok = await appWith(new MockGitClient({ head: 'a'.repeat(40), tree: baseTree, blobs: baseBlobs }));
    await getCatalog(ok, repo.id);
    const before = await waitSettled(ok, repo.id);
    await ok.close();

    const app = await appWith(new MockGitClient({ syncError: new Error('network down'), tree: baseTree }));
    await app.inject({ method: 'POST', url: `/repos/${repo.id}/context/rescan` });
    const after = await waitSettled(app, repo.id);
    expect(after.status).toBe('error');
    expect(after.error).toContain('network down');
    expect(after.files).toEqual(before.files);
    await app.close();
  });

  it('a fresh app over the same DB sees the persisted catalog (restart)', async () => {
    const repo = await insertRepo();
    const first = await appWith(new MockGitClient({ head: 'a'.repeat(40), tree: baseTree, blobs: baseBlobs }));
    await getCatalog(first, repo.id);
    const done = await waitSettled(first, repo.id);
    await first.close();

    const second = await appWith(new MockGitClient({ tree: [] }));
    const { body } = await getCatalog(second, repo.id);
    expect(body.status).toBe('ready');
    expect(body.files).toEqual(done.files);
    await second.close();
  });

  it('not-cloned repo -> not_cloned, rescan 409', async () => {
    const repo = await insertRepo(workspaceId, null);
    const app = await appWith(new MockGitClient({}));
    const { body } = await getCatalog(app, repo.id);
    expect(body.status).toBe('not_cloned');
    expect((await app.inject({ method: 'POST', url: `/repos/${repo.id}/context/rescan` })).statusCode).toBe(409);
    await app.close();
  });

  it('GET p95 over 500 documents stays under 500 ms after warm-up', async () => {
    const repo = await insertRepo();
    const tree = Array.from({ length: 500 }, (_, i) => entry(`d/${String(i).padStart(4, '0')}.md`, 5000 + i, 0));
    const app = await appWith(new MockGitClient({ head: 'a'.repeat(40), tree }));
    await getCatalog(app, repo.id);
    await waitSettled(app, repo.id);
    await getCatalog(app, repo.id); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      await getCatalog(app, repo.id);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.ceil(times.length * 0.95) - 1]!).toBeLessThanOrEqual(500);
    await app.close();
  });

  it('POST /repos/:id/resync keeps its 202 shape', async () => {
    const repo = await insertRepo();
    const app = await appWith(new MockGitClient({ head: 'a'.repeat(40), tree: baseTree }));
    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/resync` });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'accepted' });
    await app.close();
  });
});
