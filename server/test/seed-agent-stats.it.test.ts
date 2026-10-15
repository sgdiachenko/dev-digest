import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { RunTrace } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import { seedAgentStatsDemo, AGENT_STATS_DEMO } from '../src/db/seed-agent-stats.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const DAY_MS = 24 * 60 * 60 * 1000;

d('seedAgentStatsDemo (integration)', () => {
  let pg: PgFixture;
  let db: PgFixture['handle']['db'];
  let workspaceId: string;
  let beforeDemo: { prs: Record<number, { reviews: number; findings: number }> };
  const seededAt = new Date();

  async function counts() {
    const n = async (table: PgTable) =>
      Number((await db.select({ c: sql<number>`count(*)` }).from(table))[0]!.c);
    return {
      runs: await n(t.agentRuns),
      reviews: await n(t.reviews),
      findings: await n(t.findings),
      traces: await n(t.runTraces),
      prs: await n(t.pullRequests),
    };
  }

  async function legacyPrFigures() {
    const out: Record<number, { reviews: number; findings: number }> = {};
    for (const number of [482, 483, 484]) {
      const [pr] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.number, number));
      const reviews = await db.select().from(t.reviews).where(eq(t.reviews.prId, pr!.id));
      const findings = reviews.length
        ? await db
            .select()
            .from(t.findings)
            .where(
              inArray(
                t.findings.reviewId,
                reviews.map((r) => r.id),
              ),
            )
        : [];
      out[number] = { reviews: reviews.length, findings: findings.length };
    }
    return out;
  }

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    const r = await seed(db);
    workspaceId = r.workspaceId;
    beforeDemo = { prs: await legacyPrFigures() };
    await seedAgentStatsDemo(db, workspaceId, seededAt);
  }, 120_000);

  afterAll(async () => {
    await pg?.stop();
  });

  async function demoRuns() {
    return db.select().from(t.agentRuns).where(inArray(t.agentRuns.id, [...AGENT_STATS_DEMO.runIds]));
  }

  it('covers 3 agents and 2 models with mixed cost states, 1..20 days old (AC-183)', async () => {
    const runs = await demoRuns();
    expect(runs).toHaveLength(18);
    expect(new Set(runs.map((r) => r.agentId)).size).toBe(3);
    expect(new Set(runs.map((r) => r.model))).toEqual(
      new Set(['deepseek/deepseek-v4-flash', 'openai/gpt-4.1-mini']),
    );
    expect(runs.some((r) => (r.costUsd ?? 0) > 0)).toBe(true);
    expect(runs.some((r) => r.costUsd === 0)).toBe(true);
    expect(runs.some((r) => r.costUsd === null)).toBe(true);
    for (const r of runs) {
      expect(r.ranAt.getTime()).toBeLessThanOrEqual(seededAt.getTime() - DAY_MS);
      expect(r.ranAt.getTime()).toBeGreaterThanOrEqual(seededAt.getTime() - 20 * DAY_MS);
    }
    expect(runs.filter((r) => r.status === 'failed')).toHaveLength(AGENT_STATS_DEMO.expected.failed);
    expect(runs.filter((r) => r.status === 'cancelled')).toHaveLength(AGENT_STATS_DEMO.expected.cancelled);
    expect(runs.filter((r) => r.costUsd === null)).toHaveLength(AGENT_STATS_DEMO.expected.unknownCostRuns);
    const total = runs.reduce((acc, r) => acc + (r.costUsd ?? 0), 0);
    expect(total).toBeCloseTo(AGENT_STATS_DEMO.expected.totalCostUsd, 10);
  });

  it('decided findings per agent: Security 17, Performance 5, General 2 (AC-183)', async () => {
    const rows = await db
      .select({
        agent: t.agents.name,
        accepted: t.findings.acceptedAt,
        dismissed: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.agents, eq(t.agents.id, t.reviews.agentId))
      .where(inArray(t.reviews.id, [...AGENT_STATS_DEMO.reviewIds]));
    const decided = (name: string) =>
      rows.filter((r) => r.agent === name && (r.accepted || r.dismissed)).length;
    expect(decided('Security Reviewer')).toBe(17);
    expect(decided('Performance Reviewer')).toBe(5);
    expect(decided('General Reviewer')).toBe(2);
    expect(rows.filter((r) => r.accepted)).toHaveLength(AGENT_STATS_DEMO.expected.accepted);
    expect(rows.filter((r) => !r.accepted && r.dismissed)).toHaveLength(AGENT_STATS_DEMO.expected.dismissed);
    expect(rows.filter((r) => !r.accepted && !r.dismissed)).toHaveLength(AGENT_STATS_DEMO.expected.pending);
  });

  it('is idempotent: a second call adds no rows (AC-184)', async () => {
    const before = await counts();
    await seedAgentStatsDemo(db, workspaceId, new Date(seededAt.getTime() + 60_000));
    expect(await counts()).toEqual(before);
  });

  it('leaves PRs #482, #483 and #484 untouched (AC-185 / EC-26)', async () => {
    for (const number of [482, 483, 484]) {
      const [pr] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.number, number));
      const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr!.id));
      expect(runs).toHaveLength(0);
    }
    expect(await legacyPrFigures()).toEqual(beforeDemo.prs);
  });

  it('every demo trace passes RunTrace.parse and records only skills linked to its agent', async () => {
    const runs = await demoRuns();
    const links = await db.select().from(t.agentSkills);
    const traces = await db
      .select()
      .from(t.runTraces)
      .where(inArray(t.runTraces.runId, [...AGENT_STATS_DEMO.runIds]));
    expect(traces).toHaveLength(18);
    for (const row of traces) {
      const trace = RunTrace.parse(row.trace);
      const run = runs.find((r) => r.id === row.runId)!;
      const linked = new Set(links.filter((l) => l.agentId === run.agentId).map((l) => l.skillId));
      for (const id of trace.config.skills ?? []) expect(linked.has(id)).toBe(true);
    }
  });

  it('pr-quality-rubric is recorded in a demo run within the last 30 days (skill AC-40)', async () => {
    const [rubric] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, 'pr-quality-rubric')));
    const rows = await db
      .select({ ranAt: t.agentRuns.ranAt, trace: t.runTraces.trace })
      .from(t.agentRuns)
      .innerJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(inArray(t.agentRuns.id, [...AGENT_STATS_DEMO.runIds]));
    const used = rows.filter((r) =>
      (RunTrace.parse(r.trace).config.skills ?? []).includes(rubric!.id),
    );
    expect(used.length).toBeGreaterThanOrEqual(1);
    for (const r of used) expect(r.ranAt.getTime()).toBeGreaterThan(seededAt.getTime() - 30 * DAY_MS);
  });
});
