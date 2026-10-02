/**
 * PR Brief — tunables. Pure values only: no I/O, no imports from other layers.
 */

// ---- Model input budget (cl100k_base tokens) --------------------------------
export const INPUT_BUDGET_TOKENS = 8000;
export const MAX_SYSTEM_PROMPT_TOKENS = 1000;
/** Terminal budget policy: the intent is shortened to this ceiling, never removed. */
export const INTENT_FLOOR_TOKENS = 1000;

// ---- Fixed caps (never reported as `over_budget`) ---------------------------
export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_CHARS = 4000;
export const MAX_ISSUE_CHARS = 2000;
export const MAX_DIFF_STAT_ENTRIES = 300;
export const MAX_BLAST_SUMMARY_CHARS = 1000;

// ---- Timeouts (ms) ----------------------------------------------------------
export const BLAST_TIMEOUT_MS = 10_000;
export const ISSUE_TIMEOUT_MS = 5_000;
export const SPECS_TIMEOUT_MS = 5_000;
export const LLM_TIMEOUT_MS = 60_000;
/** Whole `generate` request: after this the response is 502 and nothing is written. */
export const REQUEST_DEADLINE_MS = 75_000;

// ---- Model call -------------------------------------------------------------
export const MAX_OUTPUT_TOKENS = 2000;
export const TEMPERATURE = 0.2;
export const SCHEMA_NAME = 'PrBriefOutput';

// ---- Output limits (applied after parsing) ----------------------------------
export const MAX_RISKS = 6;
export const MAX_REFS_PER_RISK = 3;
export const MAX_FOCUS_ITEMS = 8;
export const MAX_SUMMARY_CHARS = 600;
export const MAX_RISK_TITLE_CHARS = 80;
export const MAX_EXPLANATION_CHARS = 600;
export const MAX_REASON_CHARS = 160;

export const RISK_KINDS = ['security', 'db_migration', 'breaking_api', 'perf', 'deps', 'config', 'other'] as const;

/** `POST /pulls/:id/brief`, per workspace (in-process, see BriefService). */
export const RATE_LIMIT = { max: 10, windowMs: 60_000 } as const;

/** `schema_version` written into `pr_brief.json`; a different stored value reads as "no brief". */
export const STORED_SCHEMA_VERSION = 1 as const;

/**
 * Budget reduction order, lowest priority first. The first five are the
 * spec's AC-25; the last two are the terminal policy that keeps the title and
 * the intent while still guaranteeing the input fits.
 */
export const REDUCE_ORDER = [
  'specs',
  'linked_issue',
  'description',
  'blast_callers',
  'diff_stats',
  'blast_symbols',
  'intent_text',
] as const;
export type ReduceStep = (typeof REDUCE_ORDER)[number];
