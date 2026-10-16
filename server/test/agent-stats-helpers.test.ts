import { describe, it, expect } from 'vitest';
import {
  MAX_PERIOD_MS,
  acceptFigures,
  isRecordedSkillList,
  periodIssue,
  wholePercent,
} from '../src/modules/_shared/stats-rules.js';
import { SEVERITY_BUCKETS, TREND_BUCKETS } from '../src/modules/agent-stats/constants.js';
import {
  bucketSizeMs,
  buildAgentStats,
  buildPerformance,
  buildSkillsUsage,
  buildWindow,
} from '../src/modules/agent-stats/helpers.js';
import {
  FROM,
  TO,
  emptyPerformance,
  makeAgent,
  makeDecisions,
  makeRun,
  makeStatsRaw,
} from './helpers/agent-stats-fakes.js';

const DAY = 86_400_000;
const window = buildWindow(FROM, TO);
const AS_OF = new Date('2026-10-31T00:00:05.000Z');
const at = (iso: string) => new Date(iso);

const perf = (raw: Parameters<typeof buildPerformance>[0]) => buildPerformance(raw, window, AS_OF);

describe('counted runs (AC-1..AC-5, AC-16)', () => {
  it('counts a run at from but not one at to (AC-1 / EC-24)', () => {
    const out = perf(
      emptyPerformance({
        agents: [makeAgent()],
        runs: [makeRun({ id: 'r1', ranAt: FROM }), makeRun({ id: 'r2', ranAt: TO })],
      }),
    );
    expect(out.agents[0]!.runs).toBe(1);
    expect(out.summary.runs).toBe(1);
  });

  it('leaves running runs out of every figure but in_progress (AC-2 / AC-3)', () => {
    const out = perf(
      emptyPerformance({
        agents: [makeAgent()],
        runs: [
          makeRun({ id: 'r1' }),
          makeRun({ id: 'r2', status: 'running', costUsd: 5, durationMs: 99 }),
          makeRun({ id: 'r3', status: 'running', agentId: null }),
        ],
      }),
    );
    expect(out.summary.in_progress).toBe(2);
    expect(out.summary.runs).toBe(1);
    expect(out.summary.total_cost_usd).toBe(0.1);
    expect(out.agents).toHaveLength(1);
  });

  it('counts runs, failed and cancelled apart; unknown-cost runs counted (AC-4 / AC-5 / AC-16)', () => {
    const out = perf(
      emptyPerformance({
        agents: [makeAgent()],
        runs: [
          makeRun({ id: 'r1' }),
          makeRun({ id: 'r2', status: 'failed', costUsd: null }),
          makeRun({ id: 'r3', status: 'cancelled', costUsd: null }),
        ],
      }),
    );
    const row = out.agents[0]!;
    expect([row.runs, row.failed, row.cancelled, row.unknown_cost_runs]).toEqual([3, 1, 1, 2]);
    expect(out.summary.unknown_cost_runs).toBe(2);
  });
});

describe('cost and duration (AC-6..AC-10)', () => {
  it('folds known costs, divides by the known count, keeps a $0 run known (AC-6 / AC-8 / EC-12)', () => {
    const out = perf(
      emptyPerformance({
        agents: [makeAgent()],
        runs: [
          makeRun({ id: 'r1', costUsd: 0.25 }),
          makeRun({ id: 'r2', costUsd: 0 }),
          makeRun({ id: 'r3', status: 'failed', costUsd: null }),
        ],
      }),
    );
    expect(out.agents[0]!.total_cost_usd).toBe(0.25);
    expect(out.agents[0]!.avg_cost_usd).toBe(0.125);
  });

  it('reports null cost when no cost is known and 0 when every known cost is 0 (AC-7)', () => {
    const none = perf(emptyPerformance({ agents: [makeAgent()], runs: [makeRun({ costUsd: null })] }));
    expect(none.agents[0]!.total_cost_usd).toBeNull();
    expect(none.agents[0]!.avg_cost_usd).toBeNull();
    expect(none.summary.total_cost_usd).toBeNull();
    const zero = perf(emptyPerformance({ agents: [makeAgent()], runs: [makeRun({ costUsd: 0 })] }));
    expect(zero.agents[0]!.total_cost_usd).toBe(0);
    expect(zero.cost_by_agent).toEqual([]);
  });

  it('averages duration over done runs only; null with no done run (AC-9 / AC-10)', () => {
    const out = perf(
      emptyPerformance({
        agents: [makeAgent()],
        runs: [
          makeRun({ id: 'r1', durationMs: 4000 }),
          makeRun({ id: 'r2', durationMs: 8000 }),
          makeRun({ id: 'r3', status: 'failed', durationMs: 90_000 }),
        ],
      }),
    );
    expect(out.agents[0]!.avg_duration_ms).toBe(6000);
    const failedOnly = perf(
      emptyPerformance({ agents: [makeAgent()], runs: [makeRun({ status: 'failed', durationMs: 500 })] }),
    );
    expect(failedOnly.agents[0]!.avg_duration_ms).toBeNull();
  });
});

describe('decisions and accept rate (AC-11..AC-14)', () => {
  const withDecisions = (accepted: number, dismissed: number, pending = 0) =>
    perf(
      emptyPerformance({
        agents: [makeAgent()],
        runs: [makeRun({ id: 'r1' })],
        decisions: [makeDecisions('r1', accepted, dismissed, pending)],
      }),
    ).agents[0]!;

  it('computes counts and rate; ignores decisions of runs that are not done (AC-11 / AC-12 / EC-27)', () => {
    const out = perf(
      emptyPerformance({
        agents: [makeAgent()],
        runs: [makeRun({ id: 'r1' }), makeRun({ id: 'r2', status: 'failed' })],
        decisions: [makeDecisions('r1', 6, 2, 3), makeDecisions('r2', 100, 100, 100)],
      }),
    ).agents[0]!;
    expect([out.accepted, out.dismissed, out.pending]).toEqual([6, 2, 3]);
    expect(out.accept_rate).toBe(0.75);
  });

  it('has a null rate with nothing decided (AC-13 / EC-48)', () => {
    const row = withDecisions(0, 0, 4);
    expect(row.accept_rate).toBeNull();
    expect(row.small_sample).toBe(true);
  });

  it('flags a small sample at 9 decided and not at 10 (AC-14)', () => {
    expect(withDecisions(5, 4).small_sample).toBe(true);
    expect(withDecisions(5, 5).small_sample).toBe(false);
  });
});

describe('rows (AC-15, AC-22, AC-23, AC-24)', () => {
  it('puts the deleted-agent row last, only when it has counted runs (AC-15 / EC-1)', () => {
    const raw = emptyPerformance({
      agents: [makeAgent({ id: 'b', name: 'Beta' }), makeAgent({ id: 'a', name: 'Alpha' })],
      runs: [makeRun({ id: 'r1', agentId: null }), makeRun({ id: 'r2', agentId: 'b' })],
    });
    const out = perf(raw);
    expect(out.agents.map((r) => r.agent_name)).toEqual(['Alpha', 'Beta', null]);
    const last = out.agents[2]!;
    expect([last.agent_id, last.enabled, last.runs]).toEqual([null, null, 1]);
    const onlyRunning = perf({ ...raw, runs: [makeRun({ agentId: null, status: 'running' })] });
    expect(onlyRunning.agents.map((r) => r.agent_id)).toEqual(['a', 'b']);
  });

  it('returns a row for every agent, disabled and 0-run included, keyed by id (AC-22 / EC-16)', () => {
    const out = perf(
      emptyPerformance({
        agents: [
          makeAgent({ id: 'a', name: 'Same' }),
          makeAgent({ id: 'b', name: 'Same', enabled: false }),
        ],
        runs: [makeRun({ id: 'r1', agentId: 'b' })],
      }),
    );
    expect(out.agents.map((r) => [r.agent_id, r.enabled, r.runs])).toEqual([
      ['a', true, 0],
      ['b', false, 1],
    ]);
    expect(out.summary.agent_count).toBe(2);
  });

  it('takes last_run_at from finished runs at any time, null for an agent that never ran (AC-23 / EC-32)', () => {
    const out = perf(
      emptyPerformance({
        agents: [makeAgent({ id: 'a', name: 'A' }), makeAgent({ id: 'b', name: 'B' })],
        lastFinished: [
          { agentId: 'a', ranAt: at('2025-01-01T00:00:00.000Z') },
          { agentId: null, ranAt: at('2026-06-01T00:00:00.000Z') },
        ],
      }),
    );
    expect(out.agents.map((r) => r.last_run_at)).toEqual(['2025-01-01T00:00:00.000Z', null]);
    expect(out.summary.workspace_last_run_at).toBe('2026-06-01T00:00:00.000Z');
  });

  it('keeps at most 5 done runs, oldest first (AC-24)', () => {
    const runs = Array.from({ length: 7 }, (_, i) =>
      makeRun({ id: `r${i}`, ranAt: at(`2026-10-0${i + 1}T00:00:00.000Z`) }),
    );
    runs.push(makeRun({ id: 'rf', status: 'failed', ranAt: at('2026-10-20T00:00:00.000Z') }));
    const last = perf(emptyPerformance({ agents: [makeAgent()], runs })).agents[0]!.last_runs;
    expect(last.map((r) => r.run_id)).toEqual(['r2', 'r3', 'r4', 'r5', 'r6']);
  });
});

describe('summary (AC-18..AC-21)', () => {
  const raw = emptyPerformance({
    agents: [makeAgent({ id: 'a', name: 'A' }), makeAgent({ id: 'b', name: 'B' })],
    runs: [
      makeRun({ id: 'r1', agentId: 'a', costUsd: 0.1 }),
      makeRun({ id: 'r2', agentId: 'b', costUsd: 0.2 }),
      makeRun({ id: 'r3', agentId: null, costUsd: 0.4, status: 'failed' }),
    ],
    decisions: [makeDecisions('r1', 9, 1, 2), makeDecisions('r2', 1, 4, 0)],
  });

  it('sums the rows, deleted row included (AC-18)', () => {
    const { summary, agents } = perf(raw);
    expect(summary.runs).toBe(3);
    expect(summary.failed).toBe(1);
    expect(summary.total_cost_usd).toBe(agents.reduce((s, r) => s + (r.total_cost_usd ?? 0), 0));
    expect([summary.accepted, summary.dismissed, summary.pending]).toEqual([10, 5, 2]);
  });

  it('pools the accept rate over all rows (AC-19)', () => {
    const { summary } = perf(raw);
    expect(summary.avg_accept_rate).toBeCloseTo(10 / 15, 10);
    expect(summary.small_sample).toBe(false);
  });

  it('picks most active by runs, then latest run, then name (AC-20 / EC-10)', () => {
    const two = (aAt: string, bAt: string, names: [string, string] = ['A', 'B']) =>
      perf(
        emptyPerformance({
          agents: [makeAgent({ id: 'a', name: names[0] }), makeAgent({ id: 'b', name: names[1] })],
          runs: [
            makeRun({ id: 'r1', agentId: 'a', ranAt: at(aAt) }),
            makeRun({ id: 'r2', agentId: 'a', ranAt: at('2026-10-02T00:00:00.000Z') }),
            makeRun({ id: 'r3', agentId: 'b', ranAt: at(bAt) }),
            makeRun({ id: 'r4', agentId: 'b', ranAt: at('2026-10-02T00:00:00.000Z') }),
          ],
        }),
      ).summary.most_active?.agent_id;
    expect(two('2026-10-03T00:00:00.000Z', '2026-10-05T00:00:00.000Z')).toBe('b');
    expect(two('2026-10-05T00:00:00.000Z', '2026-10-03T00:00:00.000Z')).toBe('a');
    expect(two('2026-10-05T00:00:00.000Z', '2026-10-05T00:00:00.000Z', ['Zed', 'Abe'])).toBe('b');
  });

  it('has no most active when only deleted-agent runs exist (AC-21 / EC-11)', () => {
    const out = perf(emptyPerformance({ agents: [makeAgent()], runs: [makeRun({ agentId: null })] }));
    expect(out.summary.most_active).toBeNull();
  });
});

describe('cost breakdowns add up exactly (AC-25 / AC-26 / EC-2 / EC-17)', () => {
  const raw = emptyPerformance({
    agents: [
      makeAgent({ id: 'a', name: 'A' }),
      makeAgent({ id: 'b', name: 'B' }),
      makeAgent({ id: 'c', name: 'C' }),
    ],
    runs: [
      makeRun({ id: 'r1', agentId: 'a', costUsd: 0.1, model: 'm1' }),
      makeRun({ id: 'r2', agentId: 'a', costUsd: 0.2, model: 'm2' }),
      makeRun({ id: 'r3', agentId: 'b', costUsd: 0.3, model: null }),
      makeRun({ id: 'r4', agentId: 'c', costUsd: 0.7, model: 'm1' }),
    ],
  });

  it('adds rows, cost_by_agent and cost_by_model to the same total', () => {
    // cost_by_model sets its last (smallest) entry to `total - fold(others)` with no
    // correction loop. For this fixture the fold of the entries equals the total
    // bit for bit; in general the plain rule can leave the fold one binary digit
    // (1 ulp) off the total when the per-model folds round differently from the
    // total's fold, so this asserts the fixture, not a universal guarantee.
    const out = perf(raw);
    const fold = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
    const total = out.summary.total_cost_usd!;
    expect(fold(out.agents.map((r) => r.total_cost_usd!))).toBe(total);
    expect(fold(out.cost_by_agent.map((e) => e.cost_usd))).toBe(total);
    expect(fold(out.cost_by_model.map((e) => e.cost_usd))).toBe(total);
    expect(out.cost_by_model.map((e) => e.model)).toContain(null);
  });

  it('sets the last model entry to total minus the fold of the larger ones (C6)', () => {
    const out = perf(raw);
    const entries = out.cost_by_model;
    const others = entries.slice(0, -1).reduce((s, e) => s + e.cost_usd, 0);
    expect(entries[entries.length - 1]!.cost_usd).toBe(out.summary.total_cost_usd! - others);
  });

  it('keeps the last entry at its own positive fold when the residual would be <= 0', () => {
    // 1e16 + 1 rounds to 1e16, so total - fold(others) is exactly 0.
    const out = perf(
      emptyPerformance({
        agents: [makeAgent({ id: 'a', name: 'A' })],
        runs: [
          makeRun({ id: 'r1', agentId: 'a', costUsd: 1e16, model: 'big' }),
          makeRun({ id: 'r2', agentId: 'a', costUsd: 1, model: 'tiny' }),
        ],
      }),
    );
    expect(out.summary.total_cost_usd).toBe(1e16);
    expect(out.cost_by_model).toEqual([
      { model: 'big', cost_usd: 1e16 },
      { model: 'tiny', cost_usd: 1 },
    ]);
  });

  it('sorts models by amount and omits agents and models without cost', () => {
    const out = perf({
      ...raw,
      runs: [...raw.runs, makeRun({ id: 'r5', agentId: 'a', costUsd: null, model: 'm9' })],
    });
    expect(out.cost_by_model.map((e) => e.model)).toEqual(['m1', null, 'm2']);
    expect(out.cost_by_agent.map((e) => e.agent_id)).toEqual(['a', 'b', 'c']);
  });
});

describe('determinism and buckets', () => {
  it('gives the same output for shuffled input (NFR-8 / EC-28)', () => {
    const raw = emptyPerformance({
      agents: [makeAgent({ id: 'a', name: 'A' }), makeAgent({ id: 'b', name: 'B' })],
      runs: [
        makeRun({ id: 'r1', agentId: 'a', costUsd: 0.1 }),
        makeRun({ id: 'r2', agentId: 'a', costUsd: 0.2 }),
        makeRun({ id: 'r3', agentId: 'b', costUsd: 0.7, model: 'm2' }),
        makeRun({ id: 'r4', agentId: null, costUsd: 0.3, status: 'failed' }),
      ],
      decisions: [makeDecisions('r1', 3, 1), makeDecisions('r2', 2, 2), makeDecisions('r3', 1, 0, 1)],
      lastFinished: [
        { agentId: 'a', ranAt: at('2026-10-02T00:00:00.000Z') },
        { agentId: 'b', ranAt: at('2026-10-03T00:00:00.000Z') },
      ],
    });
    const shuffled = {
      agents: [...raw.agents].reverse(),
      runs: [...raw.runs].reverse(),
      decisions: [...raw.decisions].reverse(),
      lastFinished: [...raw.lastFinished].reverse(),
    };
    expect(perf(shuffled)).toEqual(perf(raw));
  });

  it('picks the bucket size at the 2d / 90d / 91d boundaries (AC-27 / EC-31)', () => {
    const size = (ms: number) => bucketSizeMs(ms, TREND_BUCKETS);
    expect(size(2 * DAY)).toBe(3_600_000);
    expect(size(2 * DAY + 1)).toBe(DAY);
    expect(size(90 * DAY)).toBe(DAY);
    expect(size(91 * DAY)).toBe(7 * DAY);
  });

  it('picks the severity bucket size at the 2d / 14d / 120d / 121d boundaries (AC-30)', () => {
    const size = (ms: number) => bucketSizeMs(ms, SEVERITY_BUCKETS);
    expect(size(2 * DAY)).toBe(4 * 3_600_000);
    expect(size(14 * DAY)).toBe(DAY);
    expect(size(14 * DAY + 1)).toBe(7 * DAY);
    expect(size(120 * DAY)).toBe(7 * DAY);
    expect(size(121 * DAY)).toBe(30 * DAY);
  });

  it('counts runs per bucket with empty buckets included (AC-27)', () => {
    const out = perf(
      emptyPerformance({
        agents: [makeAgent()],
        runs: [
          makeRun({ id: 'r1', ranAt: at('2026-10-01T05:00:00.000Z') }),
          makeRun({ id: 'r2', ranAt: at('2026-10-01T23:59:00.000Z') }),
          makeRun({ id: 'r3', ranAt: at('2026-10-03T00:00:00.000Z'), status: 'failed' }),
          makeRun({ id: 'r4', ranAt: at('2026-10-04T00:00:00.000Z'), status: 'running' }),
        ],
      }),
    );
    expect(out.runs_trend).toHaveLength(30);
    expect(out.runs_trend.slice(0, 4).map((p) => p.runs)).toEqual([2, 0, 1, 0]);
    expect(out.runs_trend[0]!.bucket_start).toBe(FROM.toISOString());
  });
});

describe('previous period (AC-34)', () => {
  const prevRun = (over = {}) => makeRun({ id: 'p1', ranAt: at('2026-09-10T00:00:00.000Z'), costUsd: 0.5, ...over });

  it('reports the previous total cost and each row previous accept rate', () => {
    const out = perf(
      emptyPerformance({
        agents: [makeAgent()],
        runs: [prevRun(), prevRun({ id: 'p2', costUsd: 0.25 }), makeRun({ id: 'r1', costUsd: 1 })],
        decisions: [makeDecisions('p1', 12, 4)],
      }),
    );
    expect(out.period.previous_from).toBe('2026-09-01T00:00:00.000Z');
    expect(out.period.previous_to).toBe(FROM.toISOString());
    expect(out.summary.previous_total_cost_usd).toBe(0.75);
    expect(out.agents[0]!.previous_accept_rate).toBe(0.75);
    expect(out.agents[0]!.previous_small_sample).toBe(false);
    expect(out.summary.total_cost_usd).toBe(1);
  });

  it('has nulls when the previous period has no data', () => {
    const out = perf(emptyPerformance({ agents: [makeAgent()], runs: [makeRun()] }));
    expect(out.summary.previous_total_cost_usd).toBeNull();
    expect(out.agents[0]!.previous_accept_rate).toBeNull();
    expect(out.agents[0]!.previous_small_sample).toBe(true);
  });
});

describe('buildAgentStats (AC-17, AC-30..AC-32, AC-34)', () => {
  const runs = [
    makeRun({ id: 'r1', costUsd: 0.1, durationMs: 4000 }),
    makeRun({ id: 'r2', costUsd: 0.2, durationMs: 8000 }),
    makeRun({ id: 'r3', status: 'failed', costUsd: null }),
    makeRun({ id: 'p1', ranAt: at('2026-09-10T00:00:00.000Z'), costUsd: 0.5 }),
  ];
  const decisions = [makeDecisions('r1', 7, 2, 1), makeDecisions('r2', 3, 0, 0)];
  const lastFinished = at('2026-10-20T00:00:00.000Z');

  it('equals the matching dashboard row field for field (AC-17)', () => {
    const row = perf(
      emptyPerformance({
        agents: [makeAgent()],
        runs,
        decisions,
        lastFinished: [{ agentId: 'a1', ranAt: lastFinished }],
      }),
    ).agents[0]!;
    const stats = buildAgentStats(
      makeStatsRaw({ runs, decisions, lastFinishedAt: lastFinished }),
      window,
      AS_OF,
    );
    expect(stats).toMatchObject(row);
    expect(stats.previous_avg_cost_usd).toBe(0.5);
    expect(stats.as_of).toBe(AS_OF.toISOString());
  });

  it('buckets findings by severity from the window start, zero buckets included (AC-30)', () => {
    const stats = buildAgentStats(
      makeStatsRaw({
        severity: [
          { bucket: 0, severity: 'CRITICAL', count: 2 },
          { bucket: 4, severity: 'SUGGESTION', count: 5 },
          { bucket: 99, severity: 'WARNING', count: 7 },
          { bucket: 1, severity: 'NITPICK', count: 7 },
        ],
      }),
      window,
      AS_OF,
    );
    expect(stats.findings_by_severity).toHaveLength(5);
    expect(stats.findings_by_severity[0]).toEqual({
      bucket_start: FROM.toISOString(),
      CRITICAL: 2,
      WARNING: 0,
      SUGGESTION: 0,
    });
    expect(stats.findings_by_severity[4]!.SUGGESTION).toBe(5);
    expect(stats.findings_by_severity.reduce((s, b) => s + b.WARNING, 0)).toBe(0);
  });

  it('orders categories by count then name (AC-31)', () => {
    const stats = buildAgentStats(
      makeStatsRaw({
        categories: [
          { category: 'style', count: 2 },
          { category: 'bug', count: 2 },
          { category: 'security', count: 9 },
        ],
      }),
      window,
      AS_OF,
    );
    expect(stats.findings_by_category.map((c) => c.category)).toEqual(['security', 'bug', 'style']);
  });
});

describe('buildSkillsUsage (AC-32, REC15)', () => {
  const ids = new Set(['r1', 'r2', 'r3', 'r4']);

  it('counts a run whose list is ["s1", 1] as without skill data', () => {
    const out = buildSkillsUsage(
      [
        { runId: 'r1', value: ['s1', 's2'] },
        { runId: 'r2', value: ['s1', 1] },
        { runId: 'r3', value: null },
        { runId: 'r4', value: ['s1', 's1'] },
      ],
      [{ id: 's1', name: 'Rubric' }],
      ids,
    );
    expect(out.runs_with_skill_data).toBe(2);
    expect(out.runs_without_skill_data).toBe(2);
    expect(out.skills).toEqual([
      { skill_id: 's1', skill_name: 'Rubric', runs: 2 },
      { skill_id: 's2', skill_name: null, runs: 1 },
    ]);
  });

  it('ignores runs that are not counted and treats a missing list row as no data', () => {
    const out = buildSkillsUsage([{ runId: 'other', value: ['s1'] }], [], ids);
    expect(out.runs_with_skill_data).toBe(0);
    expect(out.runs_without_skill_data).toBe(4);
    expect(out.skills).toEqual([]);
  });
});

describe('shared stats rules', () => {
  const NOW = Date.parse('2026-10-15T12:00:00.000Z');
  const iso = (ms: number) => new Date(ms).toISOString();

  it('periodIssue rejects from = to, from in the future and too long a span (AC-36)', () => {
    expect(periodIssue(iso(NOW - DAY), iso(NOW - DAY), NOW)).not.toBeNull();
    expect(periodIssue(iso(NOW - DAY), iso(NOW - 2 * DAY), NOW)).not.toBeNull();
    expect(periodIssue(iso(NOW + 1), iso(NOW + DAY), NOW)).not.toBeNull();
    expect(periodIssue(iso(NOW - MAX_PERIOD_MS - 1), iso(NOW), NOW)).not.toBeNull();
    expect(periodIssue('nope', iso(NOW), NOW)).not.toBeNull();
  });

  it('periodIssue accepts exactly 367 days and a normal period', () => {
    expect(periodIssue(iso(NOW - MAX_PERIOD_MS), iso(NOW), NOW)).toBeNull();
    expect(periodIssue(iso(NOW - DAY), iso(NOW), NOW)).toBeNull();
  });

  it('isRecordedSkillList accepts string arrays only (REC15)', () => {
    expect(isRecordedSkillList([])).toBe(true);
    expect(isRecordedSkillList(['a', 'b'])).toBe(true);
    for (const bad of [undefined, null, {}, 'a', ['a', 1]]) expect(isRecordedSkillList(bad)).toBe(false);
  });

  it('acceptFigures: small sample under 10 decided, null rate at 0 decided', () => {
    expect(acceptFigures(9, 0).small_sample).toBe(true);
    expect(acceptFigures(10, 0)).toEqual({ accept_rate: 1, small_sample: false });
    expect(acceptFigures(0, 0)).toEqual({ accept_rate: null, small_sample: true });
  });

  it('wholePercent rounds halves up', () => {
    expect(wholePercent(0.125)).toBe(13);
    expect(wholePercent(0.744)).toBe(74);
  });
});
