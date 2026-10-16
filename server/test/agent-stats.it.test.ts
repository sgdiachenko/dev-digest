import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { AgentPerf, AgentRunEstimate, AgentRunHistoryPage, AgentStats } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { seedAgentStatsDemo, AGENT_STATS_DEMO } from '../src/db/seed-agent-stats.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DAY = 86_400_000;
const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * DAY);
const PERIOD = new URLSearchParams({ from: daysAgo(30).toISOString(), to: new Date(NOW).toISOString() }).toString();

type Db = PgFixture['handle']['db'];
type Sev = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
type Decision = 'accepted' | 'dismissed' | 'pending';
interface FindingSpec {
  severity?: Sev;
  category?: string;
  decision?: Decision;
  kind?: string;
}
interface RunSpec {
  agentId: string | null;
  ranAt?: Date;
  status?: string;
  costUsd?: number | null;
  model?: string | null;
  durationMs?: number | null;
  source?: 'local' | 'ci';
  workspaceId?: string;
  prId?: string | null;
  findings?: FindingSpec[];
  /** `undefined` = no trace row; `'absent'` = trace without `config.skills`. */
  skills?: unknown;
  multiAgentRunId?: string;
  tokensIn?: number;
  withReview?: boolean;
}

let seq = 0;

async function startApp(pg: PgFixture, llm?: MockLLMProvider) {
  return buildApp({
    config: config(),
    db: pg.handle.db,
    overrides: {
      embedder: new MockEmbedder(),
      git: new MockGitClient({ diff: '' }),
      ...(llm ? { llm: { openai: llm, openrouter: llm } } : {}),
    },
  });
}

async function get<T>(app: FastifyInstance, url: string): Promise<{ status: number; body: T }> {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() as T };
}

d('agent stats (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: Db;
  let app: FastifyInstance;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let prId: string;
  const llm = new MockLLMProvider('openai');

  async function mkAgent(over: Partial<typeof t.agents.$inferInsert> = {}, ws = workspaceId) {
    seq += 1;
    const [a] = await db
      .insert(t.agents)
      .values({
        workspaceId: ws,
        name: `stats-agent-${seq}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'p',
        ...over,
      })
      .returning();
    return a!;
  }

  async function mkRun(spec: RunSpec) {
    const ws = spec.workspaceId ?? workspaceId;
    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId: ws,
        agentId: spec.agentId,
        prId: spec.prId === undefined ? prId : spec.prId,
        ranAt: spec.ranAt ?? daysAgo(3),
        status: spec.status ?? 'done',
        costUsd: spec.costUsd === undefined ? 0.1 : spec.costUsd,
        model: spec.model === undefined ? 'gpt-4.1' : spec.model,
        durationMs: spec.durationMs === undefined ? 6000 : spec.durationMs,
        source: spec.source ?? 'local',
        multiAgentRunId: spec.multiAgentRunId,
        tokensIn: spec.tokensIn,
        tokensOut: spec.tokensIn,
      })
      .returning();
    if (spec.skills !== undefined) {
      await db.insert(t.runTraces).values({
        runId: run!.id,
        trace: { config: spec.skills === 'absent' ? { agent: 'x' } : { agent: 'x', skills: spec.skills } },
      });
    }
    const finds = spec.findings ?? [];
    if (finds.length > 0 || spec.withReview) {
      const [review] = await db
        .insert(t.reviews)
        .values({ workspaceId: ws, prId: prId, agentId: spec.agentId, runId: run!.id, kind: 'review' })
        .returning();
      if (finds.length > 0) {
        await db.insert(t.findings).values(
          finds.map((f, i) => ({
            reviewId: review!.id,
            file: 'a.ts',
            startLine: 1,
            endLine: 1,
            severity: f.severity ?? 'WARNING',
            category: f.category ?? 'bug',
            title: `f${i}`,
            rationale: 'r',
            confidence: 0.9,
            kind: f.kind ?? 'finding',
            acceptedAt: f.decision === 'accepted' ? daysAgo(1) : null,
            dismissedAt: f.decision === 'dismissed' ? daysAgo(1) : null,
          })),
        );
      }
    }
    return run!;
  }

  const stats = (id: string, qs = PERIOD) => get<AgentStats>(app, `/agents/${id}/stats?${qs}`);
  const perf = (qs = PERIOD) => get<AgentPerf>(app, `/agents/performance?${qs}`);

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    const r = await seed(db);
    workspaceId = r.workspaceId;
    const [other] = await db.insert(t.workspaces).values({ name: 'other' }).returning();
    otherWorkspaceId = other!.id;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'stats', fullName: 'acme/stats' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 9001,
        title: 'Stats PR',
        author: 'x',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
      })
      .returning();
    prId = pr!.id;
    app = await startApp(pg, llm);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('counts only the workspace local done/failed/cancelled runs in [from, to) (AC-1, AC-2, AC-3, EC-29, EC-30)', async () => {
    const a = await mkAgent();
    const b = await mkAgent();
    await mkRun({ agentId: a.id });
    await mkRun({ agentId: a.id, status: 'failed', costUsd: null });
    const cancelled = await mkRun({ agentId: a.id, status: 'cancelled', costUsd: null });
    await mkRun({ agentId: a.id, status: 'running' });
    await mkRun({ agentId: a.id, source: 'ci' });
    await mkRun({ agentId: a.id, ranAt: daysAgo(31) });
    await mkRun({ agentId: a.id, workspaceId: otherWorkspaceId });
    // A multi-agent group: each member counts once, for its own agent.
    const [group] = await db.insert(t.multiAgentRuns).values({ workspaceId, prId }).returning();
    await mkRun({ agentId: a.id, multiAgentRunId: group!.id });
    await mkRun({ agentId: b.id, multiAgentRunId: group!.id });

    const before = await stats(a.id);
    expect(before.body.runs).toBe(4);
    expect([before.body.failed, before.body.cancelled]).toEqual([1, 1]);
    expect((await stats(b.id)).body.runs).toBe(1);
    expect((await perf()).body.summary.in_progress).toBeGreaterThanOrEqual(1);

    await db.delete(t.agentRuns).where(eq(t.agentRuns.id, cancelled.id));
    expect((await stats(a.id)).body.runs).toBe(3);
  });

  it('counts decisions through reviews.run_id at read time and ignores reviews without a run (AC-11, EC-22, EC-23)', async () => {
    const a = await mkAgent();
    const run = await mkRun({
      agentId: a.id,
      findings: [{ decision: 'accepted' }, { decision: 'accepted' }, { decision: 'dismissed' }, { decision: 'pending' }],
    });
    const [orphan] = await db.insert(t.reviews).values({ workspaceId, prId, agentId: a.id, kind: 'review' }).returning();
    await db.insert(t.findings).values({
      reviewId: orphan!.id,
      file: 'a.ts',
      startLine: 1,
      endLine: 1,
      severity: 'WARNING',
      category: 'bug',
      title: 'orphan',
      rationale: 'r',
      confidence: 0.9,
      acceptedAt: daysAgo(1),
    });
    const first = (await stats(a.id)).body;
    expect([first.accepted, first.dismissed, first.pending]).toEqual([2, 1, 1]);
    expect(first.accept_rate).toBeCloseTo(2 / 3, 10);

    // Re-triage: one accepted finding becomes dismissed.
    const [review] = await db.select().from(t.reviews).where(eq(t.reviews.runId, run.id));
    const [f] = await db.select().from(t.findings).where(eq(t.findings.reviewId, review!.id)).limit(1);
    await db.update(t.findings).set({ acceptedAt: null, dismissedAt: new Date() }).where(eq(t.findings.id, f!.id));
    const second = (await stats(a.id)).body;
    expect([second.accepted + second.dismissed, second.pending]).toEqual([3, 1]);
  });

  it('turns a deleted agent into the Deleted row and keeps it out of most-active (AC-15, EC-1, AC-28)', async () => {
    const gone = await mkAgent();
    await mkRun({ agentId: gone.id, ranAt: daysAgo(100), costUsd: 1 });
    await mkRun({ agentId: gone.id, costUsd: 0.5 });
    const keep = await mkAgent();
    await mkRun({ agentId: keep.id });
    await db.delete(t.agents).where(eq(t.agents.id, gone.id));

    const { body } = await perf();
    const deleted = body.agents.at(-1)!;
    expect(deleted.agent_id).toBeNull();
    expect(deleted.runs).toBeGreaterThanOrEqual(1);
    expect(body.summary.most_active?.agent_id).not.toBeNull();
    expect(Date.parse(body.summary.workspace_last_run_at!)).toBeGreaterThanOrEqual(daysAgo(100).getTime());
    const [counted] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    expect(body.summary.agent_count).toBe(counted!.count);
  });

  it('gives the dashboard row and the Stats tab the same figures (AC-17, EC-7, AC-18, AC-22, AC-23, AC-24)', async () => {
    const agents = [await mkAgent(), await mkAgent({ enabled: false }), await mkAgent()];
    for (const [i, a] of agents.entries()) {
      for (let k = 0; k < 7; k++) {
        await mkRun({
          agentId: a.id,
          ranAt: daysAgo(2 + k),
          costUsd: k === 6 ? null : 0.01 * (i + 1) * (k + 1),
          status: k === 5 ? 'failed' : 'done',
          findings: k % 2 === 0 ? [{ decision: 'accepted' }, { decision: 'dismissed' }] : [],
        });
      }
    }
    const dash = (await perf()).body;
    const sumRows = (pick: (r: AgentPerf['agents'][number]) => number) => dash.agents.reduce((s, r) => s + pick(r), 0);
    expect(dash.summary.runs).toBe(sumRows((r) => r.runs));
    expect(dash.summary.accepted).toBe(sumRows((r) => r.accepted));
    for (const a of agents) {
      const row = dash.agents.find((r) => r.agent_id === a.id)!;
      const tab = (await stats(a.id)).body;
      const { period: _p, as_of: _a, previous_avg_cost_usd: _pc, runs_trend: _t, findings_by_severity: _s, findings_by_category: _c, skills_usage: _u, ...rest } = tab;
      expect(rest).toEqual(row);
      expect(row.last_runs.length).toBeLessThanOrEqual(5);
      expect(row.last_run_at).not.toBeNull();
    }
    expect(dash.agents.find((r) => r.agent_id === agents[1]!.id)!.enabled).toBe(false);
    const idle = await mkAgent();
    const idleRow = (await perf()).body.agents.find((r) => r.agent_id === idle.id)!;
    expect([idleRow.runs, idleRow.last_run_at, idleRow.total_cost_usd]).toEqual([0, null, null]);
  });

  it('adds rows, cost by agent and cost by model to the same exact total (AC-25, AC-26, EC-2, EC-17)', async () => {
    const [x, y, z] = [await mkAgent(), await mkAgent(), await mkAgent()];
    const runs = [
      [x, 0.1, 'm-a'],
      [x, 0.2, 'm-b'],
      [y, 0.3, null],
      [z, 0.7, 'm-a'],
      [z, 0.000123, 'm-b'],
    ] as const;
    for (const [agent, costUsd, model] of runs) await mkRun({ agentId: agent.id, costUsd, model });
    const { body } = await perf();
    const fold = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
    const total = body.summary.total_cost_usd!;
    expect(fold(body.agents.map((r) => r.total_cost_usd ?? 0))).toBe(total);
    expect(fold(body.cost_by_agent.map((e) => e.cost_usd))).toBe(total);
    expect(fold(body.cost_by_model.map((e) => e.cost_usd))).toBe(total);
    expect(body.cost_by_model.some((e) => e.model === null)).toBe(true);
  });

  it('counts findings of every kind and decision by severity bucket and category (AC-30, AC-31)', async () => {
    const a = await mkAgent();
    await mkRun({
      agentId: a.id,
      ranAt: daysAgo(2),
      findings: [
        { severity: 'CRITICAL', category: 'security', decision: 'accepted' },
        { severity: 'WARNING', category: 'bug', decision: 'dismissed', kind: 'trifecta' },
        { severity: 'WARNING', category: 'bug', decision: 'pending' },
      ],
    });
    await mkRun({ agentId: a.id, status: 'failed', findings: [{ severity: 'CRITICAL' }] });
    const body = (await stats(a.id)).body;
    const totals = body.findings_by_severity.reduce(
      (s, b) => ({ c: s.c + b.CRITICAL, w: s.w + b.WARNING, s: s.s + b.SUGGESTION }),
      { c: 0, w: 0, s: 0 },
    );
    expect(totals).toEqual({ c: 1, w: 2, s: 0 });
    expect(body.findings_by_category).toEqual([
      { category: 'bug', count: 2 },
      { category: 'security', count: 1 },
    ]);
  });

  it('counts recorded skills, tolerates absent, malformed and deleted-skill lists (AC-32, EC-43, EC-44, REC15)', async () => {
    const a = await mkAgent();
    const [skill] = await db
      .insert(t.skills)
      .values({ workspaceId, name: `stats-skill-${(seq += 1)}`, description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning();
    const deletedId = '99999999-9999-4999-8999-999999999999';
    await mkRun({ agentId: a.id, skills: [skill!.id] });
    await mkRun({ agentId: a.id, skills: [skill!.id, deletedId] });
    await mkRun({ agentId: a.id, skills: 'absent' });
    await mkRun({ agentId: a.id, skills: ['x', 1] });
    await mkRun({ agentId: a.id, skills: { not: 'a list' } });
    await mkRun({ agentId: a.id, skills: ['not-a-uuid'] });
    await mkRun({ agentId: a.id, status: 'failed', costUsd: null });

    const res = await stats(a.id);
    expect(res.status).toBe(200);
    const usage = res.body.skills_usage;
    expect([usage.runs_with_skill_data, usage.runs_without_skill_data]).toEqual([3, 4]);
    const byId = Object.fromEntries(usage.skills.map((s) => [s.skill_id, s]));
    expect(byId[skill!.id]).toMatchObject({ skill_name: skill!.name, runs: 2 });
    expect(byId[deletedId]).toMatchObject({ skill_name: null, runs: 1 });
    expect(byId['not-a-uuid']).toMatchObject({ skill_name: null, runs: 1 });
  });

  it('pages the run history newest first, 20 per page (AC-33, EC-42, EC-45)', async () => {
    const a = await mkAgent();
    for (let i = 0; i < 45; i++) await mkRun({ agentId: a.id, ranAt: new Date(NOW - 2 * DAY - i * 60_000) });
    const failed = await mkRun({ agentId: a.id, status: 'failed', costUsd: null, prId: null, tokensIn: 0 });
    const page = (n: number) => get<AgentRunHistoryPage>(app, `/agents/${a.id}/stats/runs?${PERIOD}&page=${n}`);

    const p1 = await page(1);
    expect(AgentRunHistoryPage.safeParse(p1.body).success).toBe(true);
    expect([p1.body.items.length, p1.body.total, p1.body.page_size]).toEqual([20, 46, 20]);
    const times = p1.body.items.map((i) => i.ran_at);
    expect(times).toEqual([...times].sort().reverse());
    expect(p1.body.items[0]!.repo_full_name).toBe('acme/stats');
    expect(p1.body.items[0]!.pr_number).toBe(9001);
    expect((await page(3)).body.items).toHaveLength(6);
    const past = (await page(4)).body;
    expect([past.items.length, past.total]).toEqual([0, 46]);

    const row = (await page(1)).body.items.concat((await page(2)).body.items, (await page(3)).body.items).find((i) => i.run_id === failed.id)!;
    expect([row.repo_id, row.pr_number, row.tokens_in, row.cost_usd]).toEqual([null, null, 0, null]);
  });

  it('reports previous-period figures (AC-34)', async () => {
    const a = await mkAgent();
    await mkRun({ agentId: a.id, ranAt: daysAgo(40), costUsd: 0.5, findings: [{ decision: 'accepted' }, { decision: 'dismissed' }] });
    await mkRun({ agentId: a.id, ranAt: daysAgo(45), costUsd: 0.25 });
    await mkRun({ agentId: a.id, ranAt: daysAgo(5), costUsd: 1 });
    const body = (await stats(a.id)).body;
    expect(body.previous_avg_cost_usd).toBe(0.375);
    expect(body.previous_accept_rate).toBe(0.5);
    expect(body.previous_small_sample).toBe(true);
    const row = (await perf()).body.agents.find((r) => r.agent_id === a.id)!;
    expect(row.previous_accept_rate).toBe(0.5);
    expect((await perf()).body.summary.previous_total_cost_usd).toBeGreaterThanOrEqual(0.75);
  });

  it('answers 404 for an unknown agent and for another workspace\'s agent (AC-38, EC-21)', async () => {
    const foreign = await mkAgent({}, otherWorkspaceId);
    const unknown = '99999999-9999-4999-8999-999999999999';
    for (const id of [foreign.id, unknown]) {
      expect((await stats(id)).status).toBe(404);
      expect((await get(app, `/agents/${id}/stats/runs?${PERIOD}&page=1`)).status).toBe(404);
    }
  });

  it('makes no model call, no outbound fetch and writes no run (AC-40, NFR-5, EC-18)', async () => {
    const a = await mkAgent();
    await mkRun({ agentId: a.id });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const runsBefore = await db.select({ n: sql<number>`count(*)::int` }).from(t.agentRuns);
    await perf();
    await stats(a.id);
    await get(app, `/agents/${a.id}/stats/runs?${PERIOD}&page=1`);
    const runsAfter = await db.select({ n: sql<number>`count(*)::int` }).from(t.agentRuns);
    expect(llm.calls).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(runsAfter[0]!.n).toBe(runsBefore[0]!.n);
    fetchSpy.mockRestore();
  });

  it('returns equal bodies on two reads apart from as_of (NFR-8, EC-19)', async () => {
    const a = await mkAgent();
    await mkRun({ agentId: a.id, findings: [{ decision: 'accepted' }] });
    const strip = <T extends { as_of: string }>(b: T) => ({ ...b, as_of: '' });
    expect(strip((await perf()).body)).toEqual(strip((await perf()).body));
    expect(strip((await stats(a.id)).body)).toEqual(strip((await stats(a.id)).body));
  });

  it('leaves GET /runs/estimates unchanged (NFR-19)', async () => {
    const res = await get<unknown>(app, '/runs/estimates');
    expect(res.status).toBe(200);
    expect(AgentRunEstimate.array().safeParse(res.body).success).toBe(true);
  });
});

d('seeded Agent Performance demo (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;

  beforeAll(async () => {
    pg = await startPg();
    const { workspaceId } = await seed(pg.handle.db);
    await seedAgentStatsDemo(pg.handle.db, workspaceId, new Date());
    app = await startApp(pg);
  }, 180_000);
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('produces the 30-day demo figures (AC-183)', async () => {
    const { body } = await get<AgentPerf>(app, `/agents/performance?${PERIOD}`);
    const row = (name: string) => body.agents.find((r) => r.agent_name === name)!;
    const e = AGENT_STATS_DEMO.expected;

    const sec = row('Security Reviewer');
    expect([sec.runs, sec.failed, sec.cancelled, sec.unknown_cost_runs, sec.avg_duration_ms]).toEqual([13, 1, 1, 2, 6200]);
    expect([sec.accepted, sec.dismissed, sec.pending, sec.small_sample]).toEqual([13, 4, 3, false]);
    expect(sec.avg_cost_usd).toBe(sec.total_cost_usd! / 11);

    expect(row('Performance Reviewer').small_sample).toBe(true);
    const gen = row('General Reviewer');
    expect([gen.runs, gen.accepted, gen.pending, gen.small_sample]).toEqual([2, 2, 1, true]);

    const s = body.summary;
    expect([s.runs, s.failed, s.cancelled, s.unknown_cost_runs]).toEqual([e.runs, e.failed, e.cancelled, e.unknownCostRuns]);
    expect([s.accepted, s.dismissed, s.pending]).toEqual([e.accepted, e.dismissed, e.pending]);

    const byModel = Object.fromEntries(body.cost_by_model.map((m) => [m.model, m.cost_usd]));
    expect(byModel['deepseek/deepseek-v4-flash']).toBeCloseTo(0.46, 10);
    expect(byModel['openai/gpt-4.1-mini']).toBeCloseTo(0.06, 10);
    expect(body.cost_by_model.reduce((acc, m) => acc + m.cost_usd, 0)).toBe(s.total_cost_usd);
  });
});
