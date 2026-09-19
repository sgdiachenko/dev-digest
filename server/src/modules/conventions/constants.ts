/**
 * Conventions Extractor constants — sample sizes, per-file/whole-sample caps,
 * evidence-gate thresholds, and the job kind registered on the JobRunner.
 */

// --- Job kind (registered on JobRunner; enqueued from routes.ts) -----------
export const CONVENTIONS_EXTRACT_JOB_KIND = 'conventions-extract';

// --- Sampling (Stage 1 — pure code, no model) -------------------------------
/** Top-N repo-intel-ranked source files sampled alongside the config wish-list. */
export const TOP_CODE_SAMPLES = 12;

/**
 * Config files sampled first — they state conventions outright and are cheap
 * to read. Missing entries are skipped silently; most repos have only a few.
 */
export const CONFIG_SAMPLE_PATHS = [
  'package.json',
  'tsconfig.json',
  'eslint.config.mjs',
  'eslint.config.js',
  'eslint.config.cjs',
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.eslintrc.js',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.editorconfig',
  'biome.json',
  'CONTRIBUTING.md',
  'CLAUDE.md',
  'AGENTS.md',
] as const;

export const MAX_FILE_LINES = 220;
export const MAX_FILE_CHARS = 12_000;
export const MAX_SAMPLE_CHARS = 90_000;

// --- The evidence gate (Stage 3 — pure code) --------------------------------
export const MIN_SNIPPET_CHARS = 8;
export const MAX_SNIPPET_LINES = 8;

// --- The model call (Stage 2) -----------------------------------------------
export const MAX_CANDIDATES = 12;
export const EXTRACT_TEMPERATURE = 0.1;
export const EXTRACT_MAX_TOKENS = 4_000;
/** Well under JobRunner's default 120s job timeout (platform/jobs.ts) so the
 *  LLM call always loses the race, not the job. */
export const EXTRACT_TIMEOUT_MS = 90_000;

// --- Lever B: frequency grounding -------------------------------------------
/** Confidence bands from the count of distinct files matching a candidate's
 *  probe — replaces the model's self-reported confidence for `origin: 'model'`
 *  rows. Below the lowest band, the candidate is dropped as unsupported. */
export const SUPPORT_CONFIDENCE_BANDS = [
  { min: 10, confidence: 0.95 },
  { min: 5, confidence: 0.85 },
  { min: 3, confidence: 0.7 },
  { min: 2, confidence: 0.55 },
] as const;
/** Fewer distinct files than this and the "pattern" is a coincidence, not a
 *  convention — dropped as `dropped_unsupported`. */
export const MIN_SUPPORT_FILES = 2;
export const MAX_PROBE_CHARS = 120;
export const PROBE_GREP_TIMEOUT_MS = 5_000;

// --- Lever C: category quota -------------------------------------------------
/** After sorting by support/confidence desc, at most this many candidates per
 *  category survive — the rest are counted as `dropped_category_cap` so one
 *  loud pattern can't crowd out every other category. */
export const MAX_PER_CATEGORY = 3;

// --- Skill assembly ----------------------------------------------------------
/** Literal skill name grading criterion #42 expects — user-editable in the
 *  Create-skill modal before save. */
export const DEFAULT_SKILL_NAME = 'repo-conventions';
