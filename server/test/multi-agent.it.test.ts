import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const LONG = 'x'.repeat(4000);

/** One valid finding (line 11, 4,000-char title) and one hallucinated (line 999, dropped by grounding). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid', severity: 'CRITICAL', category: 'security', title: LONG, file: 'src/config.ts',
      start_line: 11, end_line: 11, rationale: 'A live key is committed.', suggestion: 'Use an env var.',
      confidence: 0.95, kind: 'finding',
    },
    {
      id: 'f-halluc', severity: 'WARNING', category: 'bug', title: 'Phantom finding', file: 'src/config.ts',
      start_line: 999, end_line: 999, rationale: 'Not in the diff.', confidence: 0.5, kind: 'finding',
    },
  ],
};

let seq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `ma-api-${seq++}`;
  const [repo] = await db.insert(t.repos).values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` }).returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId, repoId: repo!.id, number: 10 + seq, title: 'PR', author: 'a', branch: 'feat', base: 'main',
      headSha: 'a1b2c3d4', additions: 1, deletions: 0, filesCount: 1, status: 'needs_review', body: 'b',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return pr!;
}

d('multi-agent review (Testcontainers pg)', () => {
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

  const appWith = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });

  async function newAgents(app: Awaited<ReturnType<typeof appWith>>, n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const res = await app.inject({
        method: 'POST', url: '/agents',
        payload: { name: `MA ${seq++}-${i}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'You are a reviewer.' },
      });
      ids.push(res.json().id);
    }
    return ids;
  }

  const post = (app: Awaited<ReturnType<typeof appWith>>, prId: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: payload as never });

  it('starts a group: one group row, linked runs, response carries the group id (AC-1, AC-49)', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const ids = await newAgents(app, 3);
    const res = await post(app, pr.id, { agent_ids: ids });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(3);
    const groups = await pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, pr.id));
    expect(groups).toHaveLength(1);
    expect(body.multi_agent_run_id).toBe(groups[0]!.id);
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 3 });
    expect(runs.every((r) => r.multiAgentRunId === groups[0]!.id)).toBe(true);
  });

  it('rejects bad requests with 422 / 404 and creates no runs (AC-2..AC-5, AC-50)', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const ids = await newAgents(app, 2);
    const cases: [unknown, number, string][] = [
      [{ agent_ids: [ids[0], ids[0]] }, 422, ''],
      [{ agent_ids: [ids[0], '00000000-0000-0000-0000-000000000000'] }, 422, 'agent not found'],
      [{ agent_ids: ids, all: true }, 422, ''],
    ];
    for (const [payload, status, msg] of cases) {
      const res = await post(app, pr.id, payload);
      expect(res.statusCode).toBe(status);
      if (msg) expect(res.json().error.message).toBe(msg);
    }
    await app.inject({ method: 'PUT', url: `/agents/${ids[1]}`, payload: { enabled: false } });
    const disabled = await post(app, pr.id, { agent_ids: ids });
    expect(disabled.statusCode).toBe(422);
    expect(disabled.json().error.message).toBe('agent is disabled');
    await app.inject({ method: 'PUT', url: `/agents/${ids[1]}`, payload: { enabled: true } });
    const missingPr = await post(app, '00000000-0000-0000-0000-000000000000', { agent_ids: ids });
    expect(missingPr.statusCode).toBe(404);
    expect(await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id))).toHaveLength(0);
  });

  it('a second start while the group runs is 409 with the active group id (AC-6, EC-9)', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const ids = await newAgents(app, 2);
    const [first, second] = await Promise.all([post(app, pr.id, { agent_ids: ids }), post(app, pr.id, { agent_ids: ids })]);
    const codes = [first.statusCode, second.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const conflict = first.statusCode === 409 ? first : second;
    const ok = first.statusCode === 200 ? first : second;
    expect(conflict.json().error.details.multi_agent_run_id).toBe(ok.json().multi_agent_run_id);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
  });

  it('agentId / all keep working and report a null group (AC-7)', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const [id] = await newAgents(app, 1);
    const res = await post(app, pr.id, { agentId: id });
    expect(res.statusCode).toBe(200);
    expect(res.json().multi_agent_run_id).toBeNull();
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.multiAgentRunId).toBeNull();
    expect(await pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, pr.id))).toHaveLength(0);
  });

  it('GET returns columns, groups and full-length text; GET is read-only (AC-12, AC-17, AC-55, AC-72, AC-73)', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const ids = await newAgents(app, 3);
    await post(app, pr.id, { agent_ids: ids });
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 3 });
    const before = await pg.handle.db.select().from(t.findings);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.columns).toHaveLength(3);
    expect(body.columns.every((c: { status: string }) => c.status === 'done')).toBe(true);
    expect(body.columns[0].findings[0].title).toHaveLength(4000);
    expect(body.finding_groups).toHaveLength(1);
    expect(body.finding_groups[0].finding_ids).toHaveLength(3);
    expect(body.conflicts[0].is_conflict).toBe(false);
    expect(await pg.handle.db.select().from(t.findings)).toEqual(before);
    for (const r of runs) {
      expect(r.grounding).toBe('1/2 passed');
      const [tr] = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, r.id));
      const log = ((tr!.trace as { log: { msg: string }[] }).log).map((l) => l.msg);
      expect(log.filter((m) => m.startsWith('grounding dropped'))).toHaveLength(1);
    }
  });

  it('returns a 4000-char file path and a 4000-char error in full (AC-55)', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const [okAgent, badAgent] = await newAgents(app, 2);
    const db = pg.handle.db;
    const [group] = await db.insert(t.multiAgentRuns).values({ workspaceId, prId: pr.id }).returning();
    const [okRun] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, agentId: okAgent!, prId: pr.id, status: 'done', multiAgentRunId: group!.id })
      .returning();
    await db
      .insert(t.agentRuns)
      .values({ workspaceId, agentId: badAgent!, prId: pr.id, status: 'failed', error: LONG, multiAgentRunId: group!.id });
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, agentId: okAgent!, runId: okRun!.id, kind: 'review', verdict: 'comment', summary: 's', score: 50 })
      .returning();
    await db.insert(t.findings).values({
      reviewId: review!.id, file: LONG, startLine: 1, endLine: 1, severity: 'WARNING', category: 'bug',
      title: LONG, rationale: LONG, confidence: 0.9, kind: 'finding',
    });
    const body = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` })).json();
    const failed = body.columns.find((c: { status: string }) => c.status === 'failed');
    expect(failed.error).toBe(LONG);
    const done = body.columns.find((c: { status: string }) => c.status === 'done');
    expect(done.findings[0].file).toBe(LONG);
    expect(done.findings[0].title).toBe(LONG);
  });

  // CI-only: wall-clock timing is meaningless on a loaded dev machine; CI runs the *.it suite on a quiet runner.
  it('GET p95 stays under 300 ms for 5 runs and 200 findings (NFR-2, CI-only)', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const ids = await newAgents(app, 5);
    const db = pg.handle.db;
    const [group] = await db.insert(t.multiAgentRuns).values({ workspaceId, prId: pr.id }).returning();
    for (const agentId of ids) {
      const [run] = await db
        .insert(t.agentRuns)
        .values({ workspaceId, agentId, prId: pr.id, status: 'done', multiAgentRunId: group!.id })
        .returning();
      const [review] = await db
        .insert(t.reviews)
        .values({ workspaceId, prId: pr.id, agentId, runId: run!.id, kind: 'review', verdict: 'comment', summary: 's', score: 50 })
        .returning();
      await db.insert(t.findings).values(
        Array.from({ length: 40 }, (_, i) => ({
          reviewId: review!.id, file: `src/f${i % 10}.ts`, startLine: i + 1, endLine: i + 1, severity: 'WARNING',
          category: 'bug', title: `finding ${i}`, rationale: 'r', confidence: 0.8, kind: 'finding',
        })),
      );
    }
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
      times.push(performance.now() - start);
      expect(res.statusCode).toBe(200);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.ceil(times.length * 0.95) - 1]!).toBeLessThan(300);
  });

  it('a PR without a group is 200 null; a foreign PR is 404 (AC-14, AC-51)', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const none = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(none.statusCode).toBe(200);
    expect(none.json()).toBeNull();
    const foreign = await app.inject({ method: 'GET', url: '/pulls/00000000-0000-0000-0000-000000000000/multi-agent' });
    expect(foreign.statusCode).toBe(404);
  });

  it('a deleted agent keeps its column with null agent fields (AC-53, EC-12)', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const ids = await newAgents(app, 2);
    await post(app, pr.id, { agent_ids: ids });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    await app.inject({ method: 'DELETE', url: `/agents/${ids[0]}` });
    const body = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` })).json();
    const deleted = body.columns.filter((c: { agent_id: string | null }) => c.agent_id === null);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].agent_name).toBeNull();
    expect(deleted[0].findings.length).toBeGreaterThan(0);
    expect(body.conflicts[0].takes).toHaveLength(2);
  });

  it('deleting the group keeps the runs with a null link (NFR-10)', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const ids = await newAgents(app, 2);
    const { multi_agent_run_id } = (await post(app, pr.id, { agent_ids: ids })).json();
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    await pg.handle.db.delete(t.multiAgentRuns).where(eq(t.multiAgentRuns.id, multi_agent_run_id));
    const after = await pg.handle.db.select().from(t.agentRuns).where(inArray(t.agentRuns.id, runs.map((r) => r.id)));
    expect(after).toHaveLength(2);
    expect(after.every((r) => r.multiAgentRunId === null)).toBe(true);
  });

  it('GET /runs/estimates averages the last 5 done runs and ignores failed ones (AC-21)', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const [agentId] = await newAgents(app, 1);
    const base = Date.now();
    const rows = [
      ...[1, 2, 3, 4, 5].map((i) => ({ status: 'done', durationMs: i * 1000, costUsd: i, ago: i })),
      { status: 'done', durationMs: 900000, costUsd: 99, ago: 60 }, // older than the last 5
      { status: 'failed', durationMs: 777777, costUsd: 55, ago: 0 },
    ];
    for (const r of rows) {
      await pg.handle.db.insert(t.agentRuns).values({
        workspaceId, agentId: agentId!, prId: pr.id, status: r.status, durationMs: r.durationMs, costUsd: r.costUsd,
        ranAt: new Date(base - r.ago * 60_000),
      });
    }
    const res = await app.inject({ method: 'GET', url: '/runs/estimates' });
    expect(res.statusCode).toBe(200);
    const est = res.json().find((e: { agent_id: string }) => e.agent_id === agentId);
    expect(est).toEqual({ agent_id: agentId, runs: 5, avg_duration_ms: 3000, avg_cost_usd: 3 });
  });

  it('GET /runs/estimates lists agents without done runs with null averages', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const [withRuns, idle] = await newAgents(app, 2);
    await pg.handle.db.insert(t.agentRuns).values({
      workspaceId, agentId: withRuns!, prId: pr.id, status: 'done', durationMs: 4000, costUsd: 2,
    });
    const res = await app.inject({ method: 'GET', url: '/runs/estimates' });
    const body = res.json() as { agent_id: string }[];
    expect(body.find((e) => e.agent_id === idle)).toEqual({
      agent_id: idle, runs: 0, avg_duration_ms: null, avg_cost_usd: null,
    });
    expect(body.find((e) => e.agent_id === withRuns)).toEqual({
      agent_id: withRuns, runs: 1, avg_duration_ms: 4000, avg_cost_usd: 2,
    });
  });
});
