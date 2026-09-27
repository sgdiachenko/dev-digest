/**
 * GET /pulls/:id/history — happy path + 404, DB-backed (`PullsRepository`
 * resolves the PR/repo/files from real rows) with a `MockGitHubClient` so no
 * live GitHub call happens. Gated on Docker, matching the other integration
 * tests (e.g. `pulls-comments.it.test.ts`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrHistory } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `history-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 500,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 });
  return { repo: repo!, pr: pr! };
}

d('GET /pulls/:id/history (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('404s on an unknown PR id', async () => {
    const gh = new MockGitHubClient();
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/history',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('happy path: returns a PrHistory-shaped body, deduped and excluding the current PR', async () => {
    const gh = new MockGitHubClient({
      commitsByPath: { 'src/config.ts': [{ sha: 'c1' }] },
      pullsByCommit: {
        c1: [
          { number: 500, title: 'This very PR', merged_at: null, author: 'marisa.koch' },
          { number: 401, title: 'Earlier config change', merged_at: '2026-05-01T00:00:00Z', author: 'someone' },
        ],
      },
    });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/history` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrHistory;
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({
      pr_number: 401,
      title: 'Earlier config change',
      files_overlap: ['src/config.ts'],
    });
    await app.close();
  });
});
