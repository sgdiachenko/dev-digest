import { z } from 'zod';
import { Severity } from './findings.js';
import { Provider } from './knowledge.js';

/**
 * A6 — Productionize contracts (L08).
 *
 * NEW file (A6 owns it; the barrel re-exports it). Covers:
 *   - PluginBundle / InstalledPlugin   POST /plugins/export, /plugins/import, GET /plugins
 *   - AgentPerf / AgentPerfRow         GET /agents/performance (+ StatsPeriod, LastRun, RunsTrendPoint)
 *   - Digest / DigestSettings          Weekly Digest (settings + cron-built rows)
 *
 * Nothing here mutates an existing contract — these sit alongside A2's
 * `review-api.ts` and A5's `observability.ts`.
 */

// ---------------------------------------------------------------------------
// Plugin export / import  (.devdigest-plugin/ bundle)
// ---------------------------------------------------------------------------

/** An exported skill (config only — no DB ids; round-trippable). */
export const PluginSkill = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['rubric', 'convention', 'security', 'custom']),
  source: z.enum(['manual', 'imported_url', 'extracted', 'community']),
  body: z.string(),
  enabled: z.boolean(),
  evidence_files: z.array(z.string()).nullish(),
});
export type PluginSkill = z.infer<typeof PluginSkill>;

/** An exported agent. `skills` references PluginSkill.name within the bundle. */
export const PluginAgent = z.object({
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  /** Names of skills (in this bundle) linked to the agent, in order. */
  skills: z.array(z.string()),
});
export type PluginAgent = z.infer<typeof PluginAgent>;

/** An exported eval case. `owner_ref` ties it to an agent or skill by name. */
export const PluginEvalCase = z.object({
  name: z.string(),
  owner_kind: z.enum(['skill', 'agent']),
  owner_ref: z.string(),
  input_diff: z.string().nullish(),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown().nullish(),
  notes: z.string().nullish(),
});
export type PluginEvalCase = z.infer<typeof PluginEvalCase>;

/** An exported convention (house-rule). */
export const PluginConvention = z.object({
  rule: z.string(),
  evidence_path: z.string().nullish(),
  evidence_snippet: z.string().nullish(),
  confidence: z.number().nullish(),
  accepted: z.boolean(),
});
export type PluginConvention = z.infer<typeof PluginConvention>;

export const PluginManifest = z.object({
  name: z.string(),
  version: z.string(),
  format: z.literal('devdigest-plugin/v1'),
  exported_at: z.string(),
  description: z.string().nullish(),
  counts: z.object({
    agents: z.number().int(),
    skills: z.number().int(),
    eval_cases: z.number().int(),
    conventions: z.number().int(),
  }),
});
export type PluginManifest = z.infer<typeof PluginManifest>;

/** The whole `.devdigest-plugin/` bundle as one JSON document. */
export const PluginBundle = z.object({
  manifest: PluginManifest,
  agents: z.array(PluginAgent),
  skills: z.array(PluginSkill),
  eval_cases: z.array(PluginEvalCase),
  conventions: z.array(PluginConvention),
});
export type PluginBundle = z.infer<typeof PluginBundle>;

/** Request body for POST /plugins/export. */
export const PluginExportRequest = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  /** Limit export to a subset of agent ids (default: all). */
  agent_ids: z.array(z.string()).optional(),
});
export type PluginExportRequest = z.infer<typeof PluginExportRequest>;

/** Request body for POST /plugins/import. */
export const PluginImportRequest = z.object({
  bundle: PluginBundle,
  /** 'merge' keeps existing items; 'replace' is reserved (merge is the default). */
  mode: z.enum(['merge', 'replace']).default('merge').optional(),
});
export type PluginImportRequest = z.infer<typeof PluginImportRequest>;

/** A row in `installed_plugins` (GET /plugins). */
export const InstalledPlugin = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().nullable(),
  source: z.string().nullable(),
  installed_at: z.string(),
  enabled: z.boolean(),
});
export type InstalledPlugin = z.infer<typeof InstalledPlugin>;

/** Result of an import: what was created + the installed_plugins row. */
export const PluginImportResult = z.object({
  installed: InstalledPlugin,
  created: z.object({
    agents: z.number().int(),
    skills: z.number().int(),
    eval_cases: z.number().int(),
    conventions: z.number().int(),
  }),
});
export type PluginImportResult = z.infer<typeof PluginImportResult>;

// ---------------------------------------------------------------------------
// Agent Performance  (GET /agents/performance)
// ---------------------------------------------------------------------------

/** The selected period and the equally long period right before it (ISO-8601). */
export const StatsPeriod = z.object({
  from: z.string(),
  to: z.string(),
  previous_from: z.string(),
  previous_to: z.string(),
});
export type StatsPeriod = z.infer<typeof StatsPeriod>;

/** One of an agent's most recent counted runs (oldest first in `last_runs`). */
export const LastRun = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type LastRun = z.infer<typeof LastRun>;

/** Runs counted in one time bucket (sparkline / trend). */
export const RunsTrendPoint = z.object({
  bucket_start: z.string(),
  runs: z.number().int(),
});
export type RunsTrendPoint = z.infer<typeof RunsTrendPoint>;

/**
 * Per-agent performance row. `agent_id` / `agent_name` / `enabled` are null on
 * the single "Deleted agent" row (runs whose agent no longer exists).
 */
export const AgentPerfRow = z.object({
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  enabled: z.boolean().nullable(),
  runs: z.number().int(),
  failed: z.number().int(),
  cancelled: z.number().int(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  unknown_cost_runs: z.number().int(),
  avg_duration_ms: z.number().nullable(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  /** accepted / (accepted + dismissed), 0..1 or null. */
  accept_rate: z.number().nullable(),
  small_sample: z.boolean(),
  previous_accept_rate: z.number().nullable(),
  previous_small_sample: z.boolean(),
  last_run_at: z.string().nullable(),
  /** At most 5, oldest first. */
  last_runs: z.array(LastRun).max(5),
});
export type AgentPerfRow = z.infer<typeof AgentPerfRow>;

/** The agent with the most counted runs in the period. */
export const MostActiveAgent = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  accept_rate: z.number().nullable(),
});
export type MostActiveAgent = z.infer<typeof MostActiveAgent>;

export const AgentPerfSummary = z.object({
  runs: z.number().int(),
  failed: z.number().int(),
  cancelled: z.number().int(),
  in_progress: z.number().int(),
  total_cost_usd: z.number().nullable(),
  unknown_cost_runs: z.number().int(),
  previous_total_cost_usd: z.number().nullable(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  avg_accept_rate: z.number().nullable(),
  small_sample: z.boolean(),
  most_active: MostActiveAgent.nullable(),
  agent_count: z.number().int(),
  workspace_last_run_at: z.string().nullable(),
});
export type AgentPerfSummary = z.infer<typeof AgentPerfSummary>;

/** A donut segment {label,value,color}. */
export const PerfCostSegment = z.object({
  label: z.string(),
  value: z.number(),
});
export type PerfCostSegment = z.infer<typeof PerfCostSegment>;

/** Cost of one agent (null id/name = the Deleted agent row). */
export const CostByAgentEntry = z.object({
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  cost_usd: z.number(),
});
export type CostByAgentEntry = z.infer<typeof CostByAgentEntry>;

/** Cost of one model (null model = runs with no recorded model). */
export const CostByModelEntry = z.object({
  model: z.string().nullable(),
  cost_usd: z.number(),
});
export type CostByModelEntry = z.infer<typeof CostByModelEntry>;

/** Response of GET /agents/performance. */
export const AgentPerf = z.object({
  period: StatsPeriod,
  as_of: z.string(),
  summary: AgentPerfSummary,
  agents: z.array(AgentPerfRow),
  cost_by_agent: z.array(CostByAgentEntry),
  cost_by_model: z.array(CostByModelEntry),
  runs_trend: z.array(RunsTrendPoint),
});
export type AgentPerf = z.infer<typeof AgentPerf>;

// re-export Severity-adjacent helper to keep the import surface tidy
export { Severity };

// ---------------------------------------------------------------------------
// Weekly Digest
// ---------------------------------------------------------------------------

/** A persisted digest row (one period summary). */
export const Digest = z.object({
  id: z.string(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  body_md: z.string().nullable(),
  delivered_to: z.string().nullable(),
});
export type Digest = z.infer<typeof Digest>;

/** Request body for POST /digest/run (build now). */
export const DigestRunRequest = z.object({
  /** ISO range; defaults to the last 7 days. */
  period_start: z.string().optional(),
  period_end: z.string().optional(),
});
export type DigestRunRequest = z.infer<typeof DigestRunRequest>;
