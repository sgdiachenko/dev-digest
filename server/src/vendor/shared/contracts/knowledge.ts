import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

/** Skill name: slug-ish, stable enough to use as a prompt label. */
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

/** One immutable body snapshot (mirrors `skill_versions`). */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  /** Short "what changed" note captured at save time; null for older rows. */
  note: z.string().nullish(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** Parsed-but-not-persisted import result shown in the confirm step
    (`POST /skills/import`). Archive entries that were deliberately NOT
    processed (scripts, binaries, …) are listed in `skipped_files` so the
    import UI can show what was left out — nothing in that list was read. */
export const SkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source: SkillSource,
  skipped_files: z.array(z.string()),
});
export type SkillDraft = z.infer<typeof SkillDraft>;

/**
 * Skill editor "Stats" tab + rail-card counters — every field is derived from
 * existing tables (agent_skills / findings / reviews / agent_runs / run_traces),
 * never a separate analytics table. Nullable fields mean "not enough data yet",
 * rendered as "—", never coerced to 0/0%.
 */
export const SkillStats = z.object({
  agent_count: z.number().int(),
  /** % of linked agents' runs whose trace recorded this skill id; null when
      those agents have no runs yet (or all predate trace.config.skills). */
  pull_pct: z.number().nullable(),
  /** accepted / (accepted + dismissed) findings attributed to linked agents in
      the stats window; null when nothing has been triaged yet. */
  accept_pct: z.number().nullable(),
  /** Findings from linked agents' runs in the stats window (findings are
      attributed at agent granularity, not provably caused by this skill). */
  findings_30d: z.number().int(),
  by_category: z.array(z.object({ category: z.string(), count: z.number().int() })),
  agents: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type SkillStats = z.infer<typeof SkillStats>;

/** The `GET /skills` row shape — one request for the whole rail, no N+1. */
export const SkillWithStats = Skill.extend({ stats: SkillStats });
export type SkillWithStats = z.infer<typeof SkillWithStats>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'errors',
  'testing',
  'imports',
  'typing',
  'api',
  'general',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/**
 * Triage state of a candidate. Three states, not a boolean: a re-scan replaces
 * only `pending` rows, so `rejected` is what keeps a rule the user dismissed
 * from reappearing on every scan.
 */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/** Where a candidate came from: proposed by the model (evidence-gated) or
 *  parsed straight out of a config file (no model call, confidence fixed at 1). */
export const ConventionOrigin = z.enum(['model', 'config']);
export type ConventionOrigin = z.infer<typeof ConventionOrigin>;

/**
 * One extracted house-rule proposal. `evidence_path` / `evidence_line` /
 * `evidence_snippet` are VERIFIED server-side against the checked-out file
 * before the row is written — a candidate whose snippet is not in the file is
 * dropped, never persisted, so everything the UI shows is real code.
 */
export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string().nullish(),
  category: ConventionCategory,
  rule: z.string(),
  rationale: z.string().nullish(),
  evidence_path: z.string(),
  evidence_line: z.number().int().nullish(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  origin: ConventionOrigin,
  /** Distinct repo-wide files matching the rule's probe (frequency grounding);
      null until that pass has run, always null for `origin: 'config'` rows. */
  support_count: z.number().int().nullish(),
  created_at: z.string().nullish(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/**
 * A Conventions Extractor scan run. `POST /repos/:id/conventions/extract`
 * returns `{ status: 'accepted', scan_id, job_id }` immediately; the client
 * polls `GET /repos/:id/conventions/scan` for this shape until `status`
 * leaves `'running'`. The `dropped_*` counters explain the gap between what
 * the model proposed and what survived — a thin result reads as "the gate
 * worked", not "the feature is broken".
 */
export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  status: z.enum(['running', 'done', 'failed']),
  sampled_files: z.array(z.string()),
  proposed: z.number().int(),
  from_config: z.number().int(),
  dropped_ungrounded: z.number().int(),
  dropped_unsupported: z.number().int(),
  dropped_duplicate: z.number().int(),
  dropped_existing_skill: z.number().int(),
  dropped_category_cap: z.number().int(),
  model: z.string().nullish(),
  cost_usd: z.number().nullish(),
  error: z.string().nullish(),
  started_at: z.string(),
  finished_at: z.string().nullish(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** The 202 body of `POST /repos/:id/conventions/extract`. */
export const ConventionExtractAccepted = z.object({
  status: z.literal('accepted'),
  scan_id: z.string(),
  job_id: z.string().nullish(),
});
export type ConventionExtractAccepted = z.infer<typeof ConventionExtractAccepted>;

/**
 * The skill draft assembled from accepted candidates. Persists NOTHING — the
 * user edits it in the modal and then POSTs it to `/skills`, the same
 * preview-then-confirm flow skill import uses.
 */
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: z.literal('convention'),
  body: z.string(),
  evidence_files: z.array(z.string()),
  convention_ids: z.array(z.string()),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
