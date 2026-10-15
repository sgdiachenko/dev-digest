import { and, eq } from 'drizzle-orm';
import type { RunTrace } from '@devdigest/shared';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * Agent Performance demo fixtures: 18 runs on a dedicated demo PR (#479) of
 * acme/payments-api, spread over days 1..19 so the dashboard, the agent Stats
 * tab and the skill Stats tab all have data on a freshly seeded stack.
 *
 * Wired ONLY into the `pnpm db:seed` CLI entry, not into `seed()`: many
 * integration tests use `seed(db)` as their fixture and assert exact skill
 * stats / run estimates. Idempotent: fixed UUIDs + a first-run-id guard +
 * `onConflictDoNothing`. Never references PRs #482, #483 or #484.
 *
 * Every recorded skill id is one of the run agent's linked skills at seed time
 * (seed.ts links: Security -> secret-leakage-gate; General -> pr-quality-rubric
 * + no-then-chains; Performance -> none). The seed never changes links.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const DEMO_PR_NUMBER = 479;

type Kind = 'run' | 'review' | 'finding' | 'pr';
const KIND_CODE: Record<Kind, string> = { run: '0001', review: '0002', finding: '0003', pr: '0004' };

/** Deterministic, valid v4-shaped UUID: demo namespace + kind + counter. */
function demoId(kind: Kind, n: number): string {
  return `de0a7000-${KIND_CODE[kind]}-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

type Decision = 'accepted' | 'dismissed' | 'pending';
type Sev = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

interface DemoFinding {
  severity: Sev;
  category: string;
  decision: Decision;
}

interface DemoRun {
  agent: 'Security Reviewer' | 'Performance Reviewer' | 'General Reviewer';
  day: number;
  status: 'done' | 'failed' | 'cancelled';
  durationMs: number;
  costUsd: number | null;
  /** Skill names recorded in `config.skills`; undefined = key absent (no skill data). */
  skills?: string[];
  findings: DemoFinding[];
  tokensIn?: number;
  tokensOut?: number;
}

const AGENT_MODEL: Record<DemoRun['agent'], { provider: 'openrouter' | 'openai'; model: string }> = {
  'Security Reviewer': { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
  'Performance Reviewer': { provider: 'openai', model: 'openai/gpt-4.1-mini' },
  'General Reviewer': { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
};

function expand(n: number, v: string): string[] {
  return Array.from({ length: n }, () => v);
}

// Security: 20 findings over the 11 done runs. 3 CRITICAL / 9 WARNING / 8 SUGGESTION;
// security 9, bug 4, perf 3, style 2, test 1, docs 1; 13 accepted / 4 dismissed / 3 pending.
const SEC_SEV = [...expand(3, 'CRITICAL'), ...expand(9, 'WARNING'), ...expand(8, 'SUGGESTION')] as Sev[];
const SEC_CAT = [
  ...expand(9, 'security'),
  ...expand(4, 'bug'),
  ...expand(3, 'perf'),
  ...expand(2, 'style'),
  'test',
  'docs',
];
const SEC_DEC = [...expand(13, 'accepted'), ...expand(4, 'dismissed'), ...expand(3, 'pending')] as Decision[];
const SEC_FINDINGS: DemoFinding[] = SEC_SEV.map((severity, i) => ({
  severity,
  category: SEC_CAT[i]!,
  decision: SEC_DEC[i]!,
}));
/** First 9 done runs get 2 findings each, the last 2 get 1 each (= 20). */
function secFindingsFor(runIdx: number): DemoFinding[] {
  return runIdx < 9
    ? [SEC_FINDINGS[runIdx * 2]!, SEC_FINDINGS[runIdx * 2 + 1]!]
    : [SEC_FINDINGS[18 + (runIdx - 9)]!];
}

const SEC_DONE: Array<{ day: number; durationMs: number; costUsd: number; skilled: boolean }> = [
  { day: 1, durationMs: 5400, costUsd: 0.03, skilled: true },
  { day: 2, durationMs: 6000, costUsd: 0.05, skilled: true },
  { day: 3, durationMs: 6600, costUsd: 0.04, skilled: true },
  { day: 5, durationMs: 7000, costUsd: 0.04, skilled: true },
  { day: 6, durationMs: 5800, costUsd: 0.06, skilled: true },
  { day: 8, durationMs: 6200, costUsd: 0.02, skilled: true },
  { day: 10, durationMs: 6400, costUsd: 0.04, skilled: true },
  { day: 12, durationMs: 6000, costUsd: 0.05, skilled: true },
  { day: 14, durationMs: 6800, costUsd: 0.03, skilled: true },
  { day: 17, durationMs: 5600, costUsd: 0.06, skilled: false },
  { day: 19, durationMs: 6400, costUsd: 0, skilled: false }, // a known $0 run
];

const RUNS: DemoRun[] = [
  ...SEC_DONE.map(
    (r, i): DemoRun => ({
      agent: 'Security Reviewer',
      day: r.day,
      status: 'done',
      durationMs: r.durationMs,
      costUsd: r.costUsd,
      skills: r.skilled ? ['secret-leakage-gate'] : undefined,
      findings: secFindingsFor(i),
      ...(r.day === 1 ? { tokensIn: 14000, tokensOut: 2100 } : {}),
    }),
  ),
  { agent: 'Security Reviewer', day: 4, status: 'failed', durationMs: 1200, costUsd: null, findings: [] },
  { agent: 'Security Reviewer', day: 7, status: 'cancelled', durationMs: 800, costUsd: null, findings: [] },
  {
    agent: 'Performance Reviewer',
    day: 9,
    status: 'done',
    durationMs: 4000,
    costUsd: 0.01,
    skills: [],
    findings: [
      { severity: 'WARNING', category: 'perf', decision: 'accepted' },
      { severity: 'SUGGESTION', category: 'perf', decision: 'dismissed' },
    ],
  },
  {
    agent: 'Performance Reviewer',
    day: 13,
    status: 'done',
    durationMs: 5000,
    costUsd: 0.02,
    skills: [],
    findings: [
      { severity: 'CRITICAL', category: 'perf', decision: 'accepted' },
      { severity: 'WARNING', category: 'bug', decision: 'dismissed' },
    ],
  },
  {
    agent: 'Performance Reviewer',
    day: 18,
    status: 'done',
    durationMs: 6000,
    costUsd: 0.03,
    skills: [],
    findings: [
      { severity: 'WARNING', category: 'perf', decision: 'accepted' },
      { severity: 'SUGGESTION', category: 'bug', decision: 'pending' },
    ],
  },
  {
    agent: 'General Reviewer',
    day: 11,
    status: 'done',
    durationMs: 7000,
    costUsd: 0.02,
    skills: ['pr-quality-rubric', 'no-then-chains'],
    findings: [
      { severity: 'WARNING', category: 'perf', decision: 'accepted' },
      { severity: 'SUGGESTION', category: 'bug', decision: 'pending' },
    ],
  },
  {
    agent: 'General Reviewer',
    day: 16,
    status: 'done',
    durationMs: 8000,
    costUsd: 0.02,
    skills: ['pr-quality-rubric'],
    findings: [{ severity: 'WARNING', category: 'perf', decision: 'accepted' }],
  },
];

/** Fixed ids and the 30-day figures the demo must produce (for tests). */
export const AGENT_STATS_DEMO = {
  prNumber: DEMO_PR_NUMBER,
  runIds: RUNS.map((_, i) => demoId('run', i + 1)),
  reviewIds: RUNS.map((_, i) => demoId('review', i + 1)),
  findingIdOf: (n: number): string => demoId('finding', n),
  prId: demoId('pr', 1),
  expected: {
    runs: 18,
    failed: 1,
    cancelled: 1,
    totalCostUsd: 0.52,
    unknownCostRuns: 2,
    accepted: 18,
    dismissed: 6,
    pending: 5,
    acceptPct: 75,
    costByModel: { 'deepseek/deepseek-v4-flash': 0.46, 'openai/gpt-4.1-mini': 0.06 } as Record<string, number>,
    mostActive: 'Security Reviewer',
  },
} as const;

export async function seedAgentStatsDemo(db: Db, workspaceId: string, now = new Date()): Promise<void> {
  const [existing] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, AGENT_STATS_DEMO.runIds[0]!));
  if (existing) return;

  const agentIdByName = new Map<string, string>();
  for (const name of ['Security Reviewer', 'Performance Reviewer', 'General Reviewer']) {
    const [row] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, name)));
    if (!row) return;
    agentIdByName.set(name, row.id);
  }

  const skillIdByName = new Map<string, string>();
  for (const name of ['secret-leakage-gate', 'pr-quality-rubric', 'no-then-chains']) {
    const [row] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    if (!row) return;
    skillIdByName.set(name, row.id);
  }

  const [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) return;

  await db.transaction(async (tx) => {
    const headSha = 'd4e5f6a1b2c3';
    let [pr] = await tx
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo.id), eq(t.pullRequests.number, DEMO_PR_NUMBER)));
    if (!pr) {
      await tx
        .insert(t.pullRequests)
        .values({
          id: AGENT_STATS_DEMO.prId,
          workspaceId,
          repoId: repo.id,
          number: DEMO_PR_NUMBER,
          title: 'Retry webhook deliveries with exponential backoff',
          author: 'dan.reyes',
          branch: 'feat/webhook-backoff',
          base: 'main',
          headSha,
          lastReviewedSha: headSha,
          additions: 96,
          deletions: 12,
          filesCount: 3,
          status: 'merged',
          body: 'Retries failed webhook deliveries with exponential backoff and jitter.',
        })
        .onConflictDoNothing({ target: [t.pullRequests.repoId, t.pullRequests.number] });
      [pr] = await tx
        .select()
        .from(t.pullRequests)
        .where(and(eq(t.pullRequests.repoId, repo.id), eq(t.pullRequests.number, DEMO_PR_NUMBER)));
    }
    const prId = pr!.id;

    let findingSeq = 0;
    for (const [i, r] of RUNS.entries()) {
      const runId = AGENT_STATS_DEMO.runIds[i]!;
      const agentId = agentIdByName.get(r.agent)!;
      const { provider, model } = AGENT_MODEL[r.agent];
      const ranAt = new Date(now.getTime() - r.day * DAY_MS - i * 7 * MIN_MS);
      const done = r.status === 'done';
      const tokensIn = done ? (r.tokensIn ?? 9000 + i * 100) : 0;
      const tokensOut = done ? (r.tokensOut ?? 1500 + i * 10) : 0;

      await tx
        .insert(t.agentRuns)
        .values({
          id: runId,
          workspaceId,
          agentId,
          prId,
          ranAt,
          provider,
          model,
          durationMs: r.durationMs,
          tokensIn,
          tokensOut,
          costUsd: r.costUsd,
          status: r.status,
          error: r.status === 'failed' ? 'Provider timed out (demo)' : null,
          source: 'local',
          findingsCount: r.findings.length,
          grounding: done ? 'demo' : null,
        })
        .onConflictDoNothing();

      const trace: RunTrace = {
        config: {
          agent: r.agent,
          version: '1',
          provider,
          model,
          pr: DEMO_PR_NUMBER,
          source: 'local',
          ...(r.skills ? { skills: r.skills.map((n) => skillIdByName.get(n)!) } : {}),
        },
        stats: {
          duration_ms: r.durationMs,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: r.costUsd,
          findings: r.findings.length,
          grounding: done ? 'demo' : '0/0 passed',
        },
        prompt_assembly: { system: `${r.agent} (demo run)`, skills: null, memory: null, specs: null, user: '' },
        tool_calls: [],
        raw_output: '',
        memory_pulled: [],
        specs_read: [],
        project_context: null,
        log: [],
      };
      await tx.insert(t.runTraces).values({ runId, trace }).onConflictDoNothing();

      if (!done) continue;

      await tx
        .insert(t.reviews)
        .values({
          id: AGENT_STATS_DEMO.reviewIds[i]!,
          workspaceId,
          prId,
          agentId,
          runId,
          kind: 'review',
          verdict: 'comment',
          summary: 'Demo review for the Agent Performance dashboard.',
          score: 80,
          model,
          createdAt: new Date(ranAt.getTime() + r.durationMs),
        })
        .onConflictDoNothing();

      for (const [j, f] of r.findings.entries()) {
        findingSeq += 1;
        const decidedAt = new Date(ranAt.getTime() + r.durationMs + MIN_MS);
        await tx
          .insert(t.findings)
          .values({
            id: AGENT_STATS_DEMO.findingIdOf(findingSeq),
            reviewId: AGENT_STATS_DEMO.reviewIds[i]!,
            file: 'src/api/public/webhooks.ts',
            startLine: 10 + j,
            endLine: 12 + j,
            severity: f.severity,
            category: f.category,
            title: `Demo ${f.category} finding ${findingSeq}`,
            rationale: 'Seeded for the Agent Performance demo.',
            suggestion: null,
            confidence: 0.8,
            acceptedAt: f.decision === 'accepted' ? decidedAt : null,
            dismissedAt: f.decision === 'dismissed' ? decidedAt : null,
          })
          .onConflictDoNothing();
      }
    }
  });
}
