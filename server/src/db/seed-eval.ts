import { and, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * Eval-pipeline demo fixtures. Idempotent (select-before-insert, like seed.ts),
 * and only ever touches Security Reviewer (triaged findings) and Performance
 * Reviewer (cases + suite runs) — every other agent stays without runs.
 */

const PERF_DIFF = [
  'diff --git a/src/api/orders.ts b/src/api/orders.ts',
  '--- a/src/api/orders.ts',
  '+++ b/src/api/orders.ts',
  '@@ -10,3 +10,8 @@',
  ' export async function listOrders(userIds: string[]) {',
  '+  const out = [];',
  '+  for (const id of userIds) {',
  '+    out.push(await db.orders.findMany({ userId: id }));',
  '+  }',
  '+  return out;',
  ' }',
].join('\n');

const PERF_CLEAN_DIFF = [
  'diff --git a/src/lib/format.ts b/src/lib/format.ts',
  '--- a/src/lib/format.ts',
  '+++ b/src/lib/format.ts',
  '@@ -1,2 +1,4 @@',
  ' export function label(n: number) {',
  '+  const suffix = n === 1 ? "item" : "items";',
  '+  return `${n} ${suffix}`;',
  ' }',
].join('\n');

const PERF_INDEX_DIFF = [
  'diff --git a/src/db/queries.ts b/src/db/queries.ts',
  '--- a/src/db/queries.ts',
  '+++ b/src/db/queries.ts',
  '@@ -20,2 +20,5 @@',
  ' export function recentPayments(db: Db) {',
  "+  return db.payments.findMany({ where: { status: 'settled' }, orderBy: { createdAt: 'desc' } });",
  '+  // no index on (status, created_at) yet',
  ' }',
].join('\n');

const META = {
  pr_title: 'Seeded eval fixture',
  pr_body: null,
  pr_number: null,
  repo_full_name: null,
};

export async function seedEval(db: Db, workspaceId: string): Promise<void> {
  // ---- agent-linked review with triaged findings on PR #482 ----
  const [security] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
  const [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, 482)));

  if (security && pr) {
    const [existingReview] = await db
      .select()
      .from(t.reviews)
      .where(
        and(
          eq(t.reviews.prId, pr.id),
          eq(t.reviews.agentId, security.id),
          eq(t.reviews.model, 'seed'),
        ),
      );
    if (!existingReview) {
      await db.transaction(async (tx) => {
        const [review] = await tx
          .insert(t.reviews)
          .values({
            workspaceId,
            prId: pr.id,
            agentId: security.id,
            kind: 'review',
            verdict: 'request_changes',
            summary: 'Security pass over the rate-limiting change: three items worth triaging.',
            score: 70,
            model: 'seed',
          })
          .returning();
        const now = new Date();
        await tx.insert(t.findings).values([
          {
            reviewId: review!.id,
            file: 'src/middleware/ratelimit.ts',
            startLine: 31,
            endLine: 36,
            severity: 'WARNING',
            category: 'security',
            title: 'Rate-limit key trusts the X-Forwarded-For header',
            rationale: 'A client can spoof the header and rotate keys to bypass the limiter.',
            suggestion: 'Derive the client address from the trusted proxy chain only.',
            confidence: 0.82,
            acceptedAt: now,
          },
          {
            reviewId: review!.id,
            file: 'src/api/public/webhooks.ts',
            startLine: 18,
            endLine: 22,
            severity: 'SUGGESTION',
            category: 'security',
            title: 'Webhook error response echoes the raw upstream message',
            rationale: 'Upstream error text can leak internal hostnames to unauthenticated callers.',
            suggestion: 'Return a generic message and log the detail server-side.',
            confidence: 0.55,
            dismissedAt: now,
          },
          {
            reviewId: review!.id,
            file: 'src/config.ts',
            startLine: 20,
            endLine: 24,
            severity: 'WARNING',
            category: 'security',
            title: 'Limiter bypass list is read from an unvalidated env var',
            rationale: 'A malformed value silently disables limiting for every address.',
            suggestion: 'Validate the list at startup and fail closed.',
            confidence: 0.7,
          },
        ]);
      });
    }
  }

  // ---- Performance Reviewer: 3 cases + 2 completed suite runs ----
  const [perf] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Performance Reviewer')));
  if (!perf) return;

  const caseSeeds: Array<typeof t.evalCases.$inferInsert> = [
    {
      workspaceId,
      ownerKind: 'agent',
      ownerId: perf.id,
      agentId: perf.id,
      name: 'N+1 query in a loop',
      type: 'must_find',
      inputDiff: PERF_DIFF,
      inputMeta: META,
      expectations: [
        {
          file: 'src/api/orders.ts',
          start_line: 11,
          end_line: 14,
          severity: 'WARNING',
          category: 'perf',
          title: 'N+1 query',
        },
      ],
      diffSource: 'manual',
      sourceFindingId: null,
    },
    {
      workspaceId,
      ownerKind: 'agent',
      ownerId: perf.id,
      agentId: perf.id,
      name: 'Missing index on a hot query',
      type: 'must_find',
      inputDiff: PERF_INDEX_DIFF,
      inputMeta: META,
      expectations: [
        {
          file: 'src/db/queries.ts',
          start_line: 21,
          end_line: 22,
          severity: 'SUGGESTION',
          category: 'perf',
          title: 'Missing index',
        },
      ],
      diffSource: 'manual',
      sourceFindingId: null,
    },
    {
      workspaceId,
      ownerKind: 'agent',
      ownerId: perf.id,
      agentId: perf.id,
      name: 'Plain string formatting is not a perf issue',
      type: 'must_not_flag',
      inputDiff: PERF_CLEAN_DIFF,
      inputMeta: META,
      expectations: [
        {
          file: 'src/lib/format.ts',
          start_line: 2,
          end_line: 3,
          severity: null,
          category: null,
          title: null,
        },
      ],
      diffSource: 'manual',
      sourceFindingId: null,
    },
  ];
  const caseRows: Array<typeof t.evalCases.$inferSelect> = [];
  for (const c of caseSeeds) {
    const [existing] = await db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, perf.id),
          eq(t.evalCases.name, c.name),
        ),
      );
    if (existing) {
      caseRows.push(existing);
    } else {
      const [row] = await db.insert(t.evalCases).values(c).returning();
      caseRows.push(row!);
    }
  }

  const [existingRun] = await db
    .select({ id: t.evalSuiteRuns.id })
    .from(t.evalSuiteRuns)
    .where(eq(t.evalSuiteRuns.agentId, perf.id))
    .limit(1);
  if (existingRun) return;

  const DAY = 24 * 60 * 60 * 1000;
  const base = {
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    strategy: 'single-pass',
    skills: [],
    temperature: null,
  };
  const runSeeds = [
    {
      agentVersion: 1,
      startedAt: new Date(Date.now() - 2 * DAY),
      config: { ...base, system_prompt: 'You are a performance reviewer. Flag N+1 queries.' },
      recall: 0.5,
      precision: 0.5,
      citationAccuracy: 1,
      costUsd: 0.0021,
      durationMs: 9400,
      cases: [
        { status: 'pass' as const, recall: 1, precision: 1, expected: 1, actual: 1 },
        { status: 'fail' as const, recall: 0, precision: 0, expected: 1, actual: 0 },
        { status: 'fail' as const, recall: null, precision: null, expected: 1, actual: 1 },
      ],
    },
    {
      agentVersion: 2,
      startedAt: new Date(Date.now() - DAY),
      config: {
        ...base,
        system_prompt:
          'You are a performance reviewer. Flag N+1 queries and missing indexes; stay silent on trivial code.',
      },
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      costUsd: 0.0026,
      durationMs: 11200,
      cases: [
        { status: 'pass' as const, recall: 1, precision: 1, expected: 1, actual: 1 },
        { status: 'pass' as const, recall: 1, precision: 1, expected: 1, actual: 1 },
        { status: 'pass' as const, recall: null, precision: null, expected: 1, actual: 0 },
      ],
    },
  ];

  for (const r of runSeeds) {
    // One fact = one transaction: the suite run together with its case rows.
    await db.transaction(async (tx) => {
      const passed = r.cases.filter((c) => c.status === 'pass').length;
      const [suite] = await tx
        .insert(t.evalSuiteRuns)
        .values({
          workspaceId,
          agentId: perf.id,
          status: 'completed',
          agentVersion: r.agentVersion,
          config: r.config,
          caseIds: caseRows.map((c) => c.id),
          casesTotal: caseRows.length,
          casesCompleted: caseRows.length,
          casesErrored: 0,
          casesPassed: passed,
          recall: r.recall,
          precision: r.precision,
          citationAccuracy: r.citationAccuracy,
          costUsd: r.costUsd,
          durationMs: r.durationMs,
          startedAt: r.startedAt,
          finishedAt: new Date(r.startedAt.getTime() + r.durationMs),
        })
        .returning();
      await tx.insert(t.evalRuns).values(
        r.cases.map((c, i) => ({
          caseId: caseRows[i]!.id,
          suiteRunId: suite!.id,
          caseName: caseRows[i]!.name,
          status: c.status,
          pass: c.status === 'pass',
          recall: c.recall,
          precision: c.precision,
          citationAccuracy: c.recall === null ? null : 1,
          durationMs: Math.round(r.durationMs / r.cases.length),
          costUsd: r.costUsd / r.cases.length,
          expectedCount: c.expected,
          actualCount: c.actual,
          dropped: [],
          actualOutput: null,
          ranAt: new Date(r.startedAt.getTime() + r.durationMs),
        })),
      );
    });
  }
}
