import { z } from 'zod';
import { Severity } from './findings.js';
import { AgentPerfRow, RunsTrendPoint, StatsPeriod } from './productionize.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of GET /pulls/:id/multi-agent
 *   - AgentColumn          one member run's column in the multi-agent view
 *   - FindingGroup         findings of different member runs grouped by location
 *   - Conflict / ConflictTake  what each member run said about one finding group
 *   - AgentRunEstimate     per-agent averages over its last 5 done runs (GET /runs/estimates)
 *   - AgentStats           per-agent stats for a period (GET /agents/:id/stats)
 *   - AgentRunHistoryPage  paged run history (GET /agents/:id/stats/runs)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** A finding as surfaced in a multi-agent column (subset of FindingRecord). */
export const AgentColumnFinding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int().nullable(),
  kind: z.string().nullish(),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One member run's result column. `agent_id`/`agent_name` are null when the agent was deleted. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['running', 'done', 'failed', 'cancelled']),
  error: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** Findings of different member runs about one location (anchor rule; not persisted). */
export const FindingGroup = z.object({
  id: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  finding_ids: z.array(z.string()),
  run_ids: z.array(z.string()),
});
export type FindingGroup = z.infer<typeof FindingGroup>;

/** One member run's stance on a finding group. */
export const ConflictTake = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  persona: z.string(),
  /** Highest severity if the run flagged it; 'ignored' when a done run did not; 'no_result' otherwise. */
  verdict: z.union([Severity, z.literal('ignored'), z.literal('no_result')]),
  note: z.string(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * One entry per finding group. `is_conflict` = at least one done member did
 * NOT flag it, or the flagging members gave different severities
 * ('no_result' takes do not count). Computed from persisted findings; not stored.
 */
export const Conflict = z.object({
  group_id: z.string(),
  file: z.string(),
  line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  is_conflict: z.boolean(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of GET /pulls/:id/multi-agent (the PR's latest group). */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  /** Max of the members' known durations; 0 when none is known. */
  total_duration_ms: z.number().int(),
  /** Sum of the members' known costs; null when none is known. */
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  finding_groups: z.array(FindingGroup),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** Per-agent averages over the agent's last 5 `done` runs (GET /runs/estimates). */
export const AgentRunEstimate = z.object({
  agent_id: z.string(),
  runs: z.number().int(),
  avg_duration_ms: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
});
export type AgentRunEstimate = z.infer<typeof AgentRunEstimate>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

/** Findings of counted runs in one time bucket, by severity. */
export const SeverityBucketCount = z.object({
  bucket_start: z.string(),
  CRITICAL: z.number().int(),
  WARNING: z.number().int(),
  SUGGESTION: z.number().int(),
});
export type SeverityBucketCount = z.infer<typeof SeverityBucketCount>;

export const FindingCategoryCount = z.object({
  category: z.string(),
  count: z.number().int(),
});
export type FindingCategoryCount = z.infer<typeof FindingCategoryCount>;

/** `skill_name` is null when the recorded skill no longer exists. */
export const AgentSkillUsage = z.object({
  skill_id: z.string(),
  skill_name: z.string().nullable(),
  runs: z.number().int(),
});
export type AgentSkillUsage = z.infer<typeof AgentSkillUsage>;

export const AgentSkillsUsage = z.object({
  runs_with_skill_data: z.number().int(),
  runs_without_skill_data: z.number().int(),
  skills: z.array(AgentSkillUsage),
});
export type AgentSkillsUsage = z.infer<typeof AgentSkillsUsage>;

/** Response of GET /agents/:id/stats — every AgentPerfRow field, for one existing agent. */
export const AgentStats = AgentPerfRow.extend({
  agent_id: z.string(),
  agent_name: z.string(),
  period: StatsPeriod,
  as_of: z.string(),
  previous_avg_cost_usd: z.number().nullable(),
  runs_trend: z.array(RunsTrendPoint),
  findings_by_severity: z.array(SeverityBucketCount),
  findings_by_category: z.array(FindingCategoryCount),
  skills_usage: AgentSkillsUsage,
});
export type AgentStats = z.infer<typeof AgentStats>;

export const RunHistoryStatus = z.enum(['done', 'failed', 'cancelled']);
export type RunHistoryStatus = z.infer<typeof RunHistoryStatus>;

/** One row of the agent's Run history table. */
export const AgentRunHistoryItem = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  status: RunHistoryStatus,
  repo_id: z.string().nullable(),
  repo_full_name: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings_count: z.number().int().nullable(),
});
export type AgentRunHistoryItem = z.infer<typeof AgentRunHistoryItem>;

/** Response of GET /agents/:id/stats/runs. */
export const AgentRunHistoryPage = z.object({
  items: z.array(AgentRunHistoryItem),
  page: z.number().int().min(1),
  page_size: z.literal(20),
  total: z.number().int(),
});
export type AgentRunHistoryPage = z.infer<typeof AgentRunHistoryPage>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
