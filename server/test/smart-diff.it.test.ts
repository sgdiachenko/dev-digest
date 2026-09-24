/**
 * GET /pulls/:id/smart-diff — Testcontainers pg. Files grouped by role, the
 * latest review round's kept findings attached, tenancy-scoped, and the body
 * round-trips through the `SmartDiff` contract.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SmartDiff } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  files: { path: string; additions: number; deletions: number }[],
) {
  const name = `smart-diff-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 11,
      title: 'Smart diff test PR',
      author: 'octocat',
      branch: 'feat/sd',
      base: 'main',
      headSha: 'abc1234',
      additions: files.reduce((n, f) => n + f.additions, 0),
      deletions: files.reduce((n, f) => n + f.deletions, 0),
      filesCount: files.length,
      status: 'open',
    })
    .returning();
  if (files.length > 0) {
    await db.insert(t.prFiles).values(files.map((f) => ({ prId: pr!.id, ...f })));
  }
  return { repo: repo!, pr: pr! };
}

/** Directly seed one "agent run + its review + one finding" — bypasses the
 *  LLM/executor pipeline, matching reviews.it.test.ts's `seedRoundReview`. */
async function seedRoundReview(
  db: PgFixture['handle']['db'],
  opts: {
    workspaceId: string;
    prId: string;
    ranAt: Date;
    file: string;
    startLine: number;
    dismissed?: boolean;
  },
) {
  const [run] = await db
    .insert(t.agentRuns)
    .values({ workspaceId: opts.workspaceId, prId: opts.prId, ranAt: opts.ranAt, status: 'done' })
    .returning();
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId: opts.workspaceId,
      prId: opts.prId,
      runId: run!.id,
      kind: 'review',
      verdict: 'comment',
      summary: 'seeded',
      score: 80,
      model: 'seed',
    })
    .returning();
  const [finding] = await db
    .insert(t.findings)
    .values({
      reviewId: review!.id,
      file: opts.file,
      startLine: opts.startLine,
      endLine: opts.startLine,
      severity: 'WARNING',
      category: 'bug',
      title: 'seeded finding',
      rationale: 'seeded finding',
      confidence: 0.8,
      dismissedAt: opts.dismissed ? new Date() : null,
    })
    .returning();
  return { run: run!, review: review!, finding: finding! };
}

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
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

  it('PR with no review: groups still come from the files, no findings anywhere', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, [
      { path: 'src/service.ts', additions: 10, deletions: 2 },
      { path: 'src/service.test.ts', additions: 8, deletions: 0 },
      { path: 'package-lock.json', additions: 40, deletions: 0 },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'boilerplate']);
    for (const g of body.groups) {
      for (const f of g.files) {
        expect(f.finding_ids).toEqual([]);
      }
    }
    await app.close();
  });

  it('two rounds: only the latest round\'s findings are attached', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, [
      { path: 'src/config.ts', additions: 4, deletions: 1 },
    ]);

    // An older, separate round (well outside ROUND_WINDOW_MS).
    await seedRoundReview(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      ranAt: new Date(Date.now() - 60_000),
      file: 'src/config.ts',
      startLine: 5,
    });
    // The latest round.
    const latest = await seedRoundReview(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      ranAt: new Date(),
      file: 'src/config.ts',
      startLine: 11,
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    const file = body.groups[0]!.files[0]!;
    expect(file.finding_ids).toEqual([latest.finding.id]);
    expect(file.finding_lines).toEqual([11]);
    await app.close();
  });

  it('a dismissed finding is excluded', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, [
      { path: 'src/config.ts', additions: 4, deletions: 1 },
    ]);

    await seedRoundReview(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      ranAt: new Date(),
      file: 'src/config.ts',
      startLine: 11,
      dismissed: true,
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.groups[0]!.files[0]!.finding_ids).toEqual([]);
    await app.close();
  });

  it('a PR in another workspace 404s', async () => {
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-smart-diff' }).returning();
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { pr } = await setupRepoAndPr(pg.handle.db, otherWs!.id, [
      { path: 'src/config.ts', additions: 1, deletions: 0 },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
