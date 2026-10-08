/**
 * Onboarding tour (facts) — HTTP + real Postgres (Testcontainers), with a
 * MockGitClient serving tree/blobs/grep and a stub repo-intel facade, so no
 * real clone or index is needed. Gated on Docker like the other `*.it.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { GitTreeEntry, Onboarding } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import type { IndexState, RepoIntel } from '../src/modules/repo-intel/types.js';
import { BlobTooLargeError } from '../src/adapters/git/show-file-at-guard.js';
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

const indexed = (over: Partial<IndexState> = {}): IndexState => ({
  repoId: 'x',
  status: 'full',
  filesIndexed: 2,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: SHA,
  indexerVersion: 1,
  updatedAt: new Date(1),
  ...over,
});

const intel = (state: IndexState): RepoIntel =>
  ({
    getIndexState: async () => state,
    getGraphFacts: async () => ({ edges: [], ranks: [], fileFacts: [] }),
  }) as unknown as RepoIntel;

d('onboarding tour routes (Testcontainers pg)', () => {
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
    const name = `tour-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }

  const appWith = (git: MockGitClient, state: IndexState = indexed()) =>
    buildApp({ config: config(), db: pg.handle.db, overrides: { git, repoIntel: intel(state) } });

  const tree = [
    entry('package.json', 1, 60),
    entry('README.md', 2, 10),
    entry('.env', 3, 20),
    entry('src/index.ts', 4, 5),
  ];
  const blobs = {
    [OID(1)]: '{"name":"app","scripts":{"test":"vitest"}}',
    [OID(2)]: '# app',
    [OID(3)]: 'SECRET_TOKEN=hunter2',
  };

  it('available: 200 with facts at the indexed sha, deterministic across calls, no narrative', async () => {
    const repo = await insertRepo();
    const git = new MockGitClient({ tree, blobs });
    const app = await appWith(git);
    const a = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(a.statusCode).toBe(200);
    const body = a.json() as Onboarding;
    expect(body).toMatchObject({ repo_id: repo.id, availability: 'available', source_sha: SHA, narrative: null });
    expect(body.sections).not.toBeNull();
    const b = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` })).json() as Onboarding;
    expect(b.sections).toEqual(body.sections);
    await app.close();
  });

  it('never reads or leaks .env contents', async () => {
    const repo = await insertRepo();
    const git = new MockGitClient({ tree, blobs });
    const app = await appWith(git);
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(git.readBlobCalls).not.toContain(OID(3));
    expect(res.body).not.toContain('hunter2');
    await app.close();
  });

  it('an oversized or unreadable file is skipped and counted, not a 500', async () => {
    const repo = await insertRepo();
    const git = new MockGitClient({
      tree: [entry('package.json', 1, 600 * 1024), entry('README.md', 2, 10)],
      blobs,
      readBlobError: new BlobTooLargeError('x', '(blob)', 600 * 1024, 512 * 1024),
    });
    const app = await appWith(git);
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/tour` });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Onboarding).index.files_skipped_by_tour).toBeGreaterThan(0);
    await app.close();
  });

  it('not_cloned and not_indexed return 200 with no sections', async () => {
    const noClone = await insertRepo(workspaceId, null);
    const app = await appWith(new MockGitClient({ tree, blobs }));
    const a = (await app.inject({ method: 'GET', url: `/repos/${noClone.id}/tour` })).json() as Onboarding;
    expect(a).toMatchObject({ availability: 'not_cloned', sections: null, source_sha: null });
    await app.close();

    const cloned = await insertRepo();
    const app2 = await appWith(new MockGitClient({ tree, blobs }), indexed({ lastIndexedSha: '', status: 'failed' }));
    const b = (await app2.inject({ method: 'GET', url: `/repos/${cloned.id}/tour` })).json() as Onboarding;
    expect(b).toMatchObject({ availability: 'not_indexed', sections: null });
    await app2.close();
  });

  it('unknown repo -> 404, non-uuid id -> 422', async () => {
    const app = await appWith(new MockGitClient({ tree, blobs }));
    const missing = await app.inject({ method: 'GET', url: '/repos/00000000-0000-4000-8000-000000000000/tour' });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({ method: 'GET', url: '/repos/not-a-uuid/tour' });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });
});
