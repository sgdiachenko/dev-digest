import { z } from 'zod';
import { Severity } from './findings.js';

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
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
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

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

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
