/**
 * Agent Performance — pure aggregation (no I/O). The dashboard rows and the
 * agent Stats response are built from the same `buildRow`, so the two agree by
 * construction. The rules every consumer shares (counted statuses, accept
 * figures, recorded skill list) come from `_shared/stats-rules.ts`.
 *
 * Cost arithmetic is IEEE-double and order-fixed (runs by id, rows in response
 * order) so the totals the API reports add up exactly:
 *   row total       = left fold from 0 over the row's known costs, by run id
 *   summary total   = fold of the row totals in response row order
 *   cost_by_agent   = rows with a total above 0, in row order
 *   cost_by_model   = per-model folds, biggest first, last entry reconciled
 */
import type {
  AgentPerf,
  AgentPerfRow,
  AgentRunHistoryPage,
  AgentSkillsUsage,
  AgentStats,
  CostByModelEntry,
  FindingCategoryCount,
  LastRun,
  MostActiveAgent,
  RunsTrendPoint,
  SeverityBucketCount,
  StatsPeriod,
} from '@devdigest/shared';
import { COUNTED_STATUSES, acceptFigures, isRecordedSkillList } from '../_shared/stats-rules.js';
import {
  LAST_RUNS_LIMIT,
  RUN_HISTORY_PAGE_SIZE,
  SEVERITY_BUCKETS,
  TREND_BUCKETS,
  type BucketTier,
} from './constants.js';
import type {
  AgentRef,
  AgentStatsRaw,
  PerformanceRaw,
  RunDecisions,
  RunFact,
  RunHistoryPageRaw,
  SkillListRaw,
  StatsWindow,
} from './types.js';

// ---- window and buckets ----------------------------------------------------

/** The period plus the equally long one ending at `from`. */
export function buildWindow(from: Date, to: Date): StatsWindow {
  const span = to.getTime() - from.getTime();
  return { from, to, previousFrom: new Date(from.getTime() - span), previousTo: from };
}

export function periodOf(window: StatsWindow): StatsPeriod {
  return {
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    previous_from: window.previousFrom.toISOString(),
    previous_to: window.previousTo.toISOString(),
  };
}

/** Bucket size for a period of `spanMs` (a span equal to a tier limit uses that tier). */
export function bucketSizeMs(spanMs: number, tiers: readonly BucketTier[]): number {
  const tier = tiers.find((t) => spanMs <= t.maxSpanMs) ?? tiers[tiers.length - 1]!;
  return tier.sizeMs;
}

/** Every bucket start from `from` up to (not including) `to`, empty buckets included. */
export function bucketStarts(from: Date, to: Date, sizeMs: number): Date[] {
  const count = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / sizeMs));
  return Array.from({ length: count }, (_, i) => new Date(from.getTime() + i * sizeMs));
}

export function bucketIndex(at: Date, from: Date, sizeMs: number): number {
  return Math.floor((at.getTime() - from.getTime()) / sizeMs);
}

// ---- costs and per-row figures --------------------------------------------

/** Left fold from 0 over the known costs; `null` when no cost is known (never 0). */
export function foldCosts(costs: readonly (number | null)[]): number | null {
  let total = 0;
  let known = false;
  for (const c of costs) {
    if (c === null) continue;
    total += c;
    known = true;
  }
  return known ? total : null;
}

const isCounted = (r: RunFact): boolean => (COUNTED_STATUSES as readonly string[]).includes(r.status);
const byId = (a: RunFact, b: RunFact): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const inRange = (at: Date, from: Date, to: Date): boolean => at >= from && at < to;

/** The row total: runs ordered by id, so the same data always folds the same way. */
function rowCost(runs: readonly RunFact[]): number | null {
  return foldCosts([...runs].filter(isCounted).sort(byId).map((r) => r.costUsd));
}

type RowFigures = Pick<
  AgentPerfRow,
  | 'runs'
  | 'failed'
  | 'cancelled'
  | 'total_cost_usd'
  | 'avg_cost_usd'
  | 'unknown_cost_runs'
  | 'avg_duration_ms'
  | 'accepted'
  | 'dismissed'
  | 'pending'
  | 'accept_rate'
  | 'small_sample'
  | 'last_runs'
>;

/** Up to 5 of the latest `done` runs, oldest first. */
export function lastRunsOf(runs: readonly RunFact[]): LastRun[] {
  return runs
    .filter((r) => r.status === 'done')
    .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice(0, LAST_RUNS_LIMIT)
    .reverse()
    .map((r) => ({
      run_id: r.id,
      ran_at: r.ranAt.toISOString(),
      duration_ms: r.durationMs,
      cost_usd: r.costUsd,
    }));
}

/**
 * The single rule set for one group of runs (one agent, or the deleted-agent
 * group). `running` runs are ignored; decisions count only for `done` runs.
 */
export function buildRowFigures(runs: readonly RunFact[], decisions: readonly RunDecisions[]): RowFigures {
  const counted = runs.filter(isCounted).sort(byId);
  const done = counted.filter((r) => r.status === 'done');
  const doneIds = new Set(done.map((r) => r.id));
  const total = foldCosts(counted.map((r) => r.costUsd));
  const knownCosts = counted.filter((r) => r.costUsd !== null).length;
  const durations = done.map((r) => r.durationMs).filter((d): d is number => d !== null);

  let accepted = 0;
  let dismissed = 0;
  let pending = 0;
  for (const d of decisions) {
    if (!doneIds.has(d.runId)) continue;
    accepted += d.accepted;
    dismissed += d.dismissed;
    pending += d.pending;
  }

  return {
    runs: counted.length,
    failed: counted.filter((r) => r.status === 'failed').length,
    cancelled: counted.filter((r) => r.status === 'cancelled').length,
    total_cost_usd: total,
    avg_cost_usd: total === null ? null : total / knownCosts,
    unknown_cost_runs: counted.length - knownCosts,
    avg_duration_ms: durations.length === 0 ? null : durations.reduce((s, d) => s + d, 0) / durations.length,
    accepted,
    dismissed,
    pending,
    ...acceptFigures(accepted, dismissed),
    last_runs: lastRunsOf(counted),
  };
}

function buildRow(
  agent: AgentRef | null,
  current: readonly RunFact[],
  previous: readonly RunFact[],
  decisions: readonly RunDecisions[],
  lastFinishedAt: Date | null,
): AgentPerfRow {
  const prev = buildRowFigures(previous, decisions);
  return {
    agent_id: agent?.id ?? null,
    agent_name: agent?.name ?? null,
    enabled: agent?.enabled ?? null,
    ...buildRowFigures(current, decisions),
    previous_accept_rate: prev.accept_rate,
    previous_small_sample: prev.small_sample,
    last_run_at: lastFinishedAt?.toISOString() ?? null,
  };
}

// ---- trend ------------------------------------------------------------------

function buildTrend(counted: readonly RunFact[], window: StatsWindow): RunsTrendPoint[] {
  const size = bucketSizeMs(window.to.getTime() - window.from.getTime(), TREND_BUCKETS);
  const starts = bucketStarts(window.from, window.to, size);
  const counts = new Array<number>(starts.length).fill(0);
  for (const r of counted) {
    const i = bucketIndex(r.ranAt, window.from, size);
    if (i >= 0 && i < counts.length) counts[i] = (counts[i] ?? 0) + 1;
  }
  return starts.map((s, i) => ({ bucket_start: s.toISOString(), runs: counts[i] ?? 0 }));
}

// ---- dashboard ----------------------------------------------------------------

const byName = (a: AgentRef, b: AgentRef): number =>
  a.name.localeCompare(b.name, 'en') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function groupBy(runs: readonly RunFact[], keyOf: (r: RunFact) => string | null): Map<string | null, RunFact[]> {
  const groups = new Map<string | null, RunFact[]>();
  for (const r of runs) {
    const key = keyOf(r);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return groups;
}

function latest(dates: readonly Date[]): Date | null {
  return dates.reduce<Date | null>((m, d) => (m === null || d > m ? d : m), null);
}

/**
 * Per-model folds, biggest first; the last entry is `total - fold(others)` (plan C6).
 * Guard: when that residual is not a finite number > 0 (float rounding between the
 * differently ordered folds), the last entry keeps its own positive fold instead, so
 * the entries may then differ from the total by float error.
 */
function costByModel(counted: readonly RunFact[], total: number | null): CostByModelEntry[] {
  const groups = new Map<string | null, RunFact[]>();
  for (const r of counted) {
    if (r.costUsd === null) continue;
    const list = groups.get(r.model);
    if (list) list.push(r);
    else groups.set(r.model, [r]);
  }
  const entries: CostByModelEntry[] = [];
  for (const [model, runs] of groups) {
    const cost = rowCost(runs);
    if (cost !== null && cost > 0) entries.push({ model, cost_usd: cost });
  }
  entries.sort(
    (a, b) =>
      b.cost_usd - a.cost_usd ||
      (a.model === null ? 1 : b.model === null ? -1 : a.model < b.model ? -1 : a.model > b.model ? 1 : 0),
  );
  const last = entries[entries.length - 1];
  if (last && total !== null) {
    const others = entries.slice(0, -1).reduce((s, e) => s + e.cost_usd, 0);
    const residual = total - others;
    if (Number.isFinite(residual) && residual > 0) last.cost_usd = residual;
  }
  return entries;
}

export function buildPerformance(raw: PerformanceRaw, window: StatsWindow, asOf: Date): AgentPerf {
  const known = new Set(raw.agents.map((a) => a.id));
  const keyOf = (r: RunFact): string | null => (r.agentId !== null && known.has(r.agentId) ? r.agentId : null);
  const current = raw.runs.filter((r) => inRange(r.ranAt, window.from, window.to));
  const previous = raw.runs.filter((r) => inRange(r.ranAt, window.previousFrom, window.from));
  const counted = current.filter(isCounted);
  const currentBy = groupBy(current, keyOf);
  const previousBy = groupBy(previous, keyOf);
  const lastFinishedFor = (id: string | null): Date | null =>
    latest(raw.lastFinished.filter((l) => (l.agentId !== null && known.has(l.agentId) ? l.agentId : null) === id).map((l) => l.ranAt));

  const agents = [...raw.agents].sort(byName);
  const rows: AgentPerfRow[] = agents.map((a) =>
    buildRow(a, currentBy.get(a.id) ?? [], previousBy.get(a.id) ?? [], raw.decisions, lastFinishedFor(a.id)),
  );
  const deletedCurrent = currentBy.get(null) ?? [];
  if (deletedCurrent.some(isCounted)) {
    rows.push(buildRow(null, deletedCurrent, previousBy.get(null) ?? [], raw.decisions, lastFinishedFor(null)));
  }

  const sum = (pick: (r: AgentPerfRow) => number): number => rows.reduce((s, r) => s + pick(r), 0);
  const total = foldCosts(rows.map((r) => r.total_cost_usd));
  const previousTotal = foldCosts([
    ...agents.map((a) => rowCost(previousBy.get(a.id) ?? [])),
    rowCost(previousBy.get(null) ?? []),
  ]);
  const accepted = sum((r) => r.accepted);
  const dismissed = sum((r) => r.dismissed);
  const pooled = acceptFigures(accepted, dismissed);

  const latestRunAt = (id: string): Date | null => latest((currentBy.get(id) ?? []).filter(isCounted).map((r) => r.ranAt));
  const candidates = rows.filter((r) => r.agent_id !== null && r.runs > 0);
  candidates.sort(
    (a, b) =>
      b.runs - a.runs ||
      (latestRunAt(b.agent_id!)?.getTime() ?? 0) - (latestRunAt(a.agent_id!)?.getTime() ?? 0) ||
      (a.agent_name ?? '').localeCompare(b.agent_name ?? '', 'en') ||
      (a.agent_id! < b.agent_id! ? -1 : 1),
  );
  const top = candidates[0];
  const mostActive: MostActiveAgent | null = top
    ? { agent_id: top.agent_id!, agent_name: top.agent_name!, runs: top.runs, accept_rate: top.accept_rate }
    : null;

  return {
    period: periodOf(window),
    as_of: asOf.toISOString(),
    summary: {
      runs: sum((r) => r.runs),
      failed: sum((r) => r.failed),
      cancelled: sum((r) => r.cancelled),
      in_progress: current.filter((r) => r.status === 'running').length,
      total_cost_usd: total,
      unknown_cost_runs: sum((r) => r.unknown_cost_runs),
      previous_total_cost_usd: previousTotal,
      accepted,
      dismissed,
      pending: sum((r) => r.pending),
      avg_accept_rate: pooled.accept_rate,
      small_sample: pooled.small_sample,
      most_active: mostActive,
      agent_count: raw.agents.length,
      workspace_last_run_at: latest(raw.lastFinished.map((l) => l.ranAt))?.toISOString() ?? null,
    },
    agents: rows,
    cost_by_agent: rows
      .filter((r) => r.total_cost_usd !== null && r.total_cost_usd > 0)
      .map((r) => ({ agent_id: r.agent_id, agent_name: r.agent_name, cost_usd: r.total_cost_usd! })),
    cost_by_model: costByModel(counted, total),
    runs_trend: buildTrend(counted, window),
  };
}

// ---- agent Stats ----------------------------------------------------------------

/**
 * How many counted runs recorded each skill. A run counts as having skill data
 * only when its `config.skills` is a recorded skill list; any other value
 * (absent, null, an object, a mixed array) counts as without.
 */
export function buildSkillsUsage(
  skillLists: readonly SkillListRaw[],
  skillNames: readonly { id: string; name: string }[],
  countedRunIds: ReadonlySet<string>,
): AgentSkillsUsage {
  const names = new Map(skillNames.map((s) => [s.id, s.name]));
  const perSkill = new Map<string, number>();
  let withData = 0;
  const seen = new Set<string>();
  for (const { runId, value } of skillLists) {
    if (!countedRunIds.has(runId) || seen.has(runId)) continue;
    seen.add(runId);
    if (!isRecordedSkillList(value)) continue;
    withData += 1;
    for (const id of new Set(value)) perSkill.set(id, (perSkill.get(id) ?? 0) + 1);
  }
  const skills = [...perSkill].map(([skill_id, runs]) => ({
    skill_id,
    skill_name: names.get(skill_id) ?? null,
    runs,
  }));
  skills.sort(
    (a, b) =>
      b.runs - a.runs ||
      (a.skill_name ?? '').localeCompare(b.skill_name ?? '', 'en') ||
      (a.skill_id < b.skill_id ? -1 : a.skill_id > b.skill_id ? 1 : 0),
  );
  return {
    runs_with_skill_data: withData,
    runs_without_skill_data: countedRunIds.size - withData,
    skills,
  };
}

function buildSeverity(raw: AgentStatsRaw, window: StatsWindow): SeverityBucketCount[] {
  const size = bucketSizeMs(window.to.getTime() - window.from.getTime(), SEVERITY_BUCKETS);
  const buckets = bucketStarts(window.from, window.to, size).map((s) => ({
    bucket_start: s.toISOString(),
    CRITICAL: 0,
    WARNING: 0,
    SUGGESTION: 0,
  }));
  for (const { bucket, severity, count } of raw.severity) {
    const b = buckets[bucket];
    if (b && (severity === 'CRITICAL' || severity === 'WARNING' || severity === 'SUGGESTION')) b[severity] += count;
  }
  return buckets;
}

function buildCategories(raw: AgentStatsRaw): FindingCategoryCount[] {
  return raw.categories
    .map((c) => ({ category: c.category, count: c.count }))
    .sort((a, b) => b.count - a.count || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
}

export function buildAgentStats(raw: AgentStatsRaw, window: StatsWindow, asOf: Date): AgentStats {
  const current = raw.runs.filter((r) => inRange(r.ranAt, window.from, window.to));
  const previous = raw.runs.filter((r) => inRange(r.ranAt, window.previousFrom, window.from));
  const counted = current.filter(isCounted);
  const row = buildRow(raw.agent, current, previous, raw.decisions, raw.lastFinishedAt);
  return {
    ...row,
    agent_id: raw.agent.id,
    agent_name: raw.agent.name,
    period: periodOf(window),
    as_of: asOf.toISOString(),
    previous_avg_cost_usd: buildRowFigures(previous, []).avg_cost_usd,
    runs_trend: buildTrend(counted, window),
    findings_by_severity: buildSeverity(raw, window),
    findings_by_category: buildCategories(raw),
    skills_usage: buildSkillsUsage(raw.skillLists, raw.skillNames, new Set(counted.map((r) => r.id))),
  };
}

// ---- run history ------------------------------------------------------------------

export function toRunHistoryPage(raw: RunHistoryPageRaw, page: number): AgentRunHistoryPage {
  return {
    items: raw.rows.map((r) => ({
      run_id: r.runId,
      ran_at: r.ranAt.toISOString(),
      status: r.status,
      repo_id: r.repoId,
      repo_full_name: r.repoFullName,
      pr_number: r.prNumber,
      tokens_in: r.tokensIn,
      tokens_out: r.tokensOut,
      cost_usd: r.costUsd,
      findings_count: r.findingsCount,
    })),
    page,
    page_size: RUN_HISTORY_PAGE_SIZE,
    total: raw.total,
  };
}
