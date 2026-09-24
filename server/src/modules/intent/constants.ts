/**
 * Intent Layer constants — source limits, the cheap-model call's parameters,
 * and the extraction clamp bounds. See docs/plans/intent-layer.md ("Джерела
 * даних", "Промпт дешевої моделі") for the source of these numbers.
 */

/** Bumped whenever the extraction prompt's meaning changes, so a cached
 *  `pr_intent` row derived under an older prompt version is never reused
 *  (folded into `inputHash`). */
export const PROMPT_VERSION = 'v1';

// ---- Source limits (chars unless noted) ------------------------------------
export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_CHARS = 4000;
export const MAX_LINKED_ISSUES = 3;
export const MAX_ISSUE_CHARS = 3000;
export const MAX_LINKED_SPEC_DOCS = 3;
export const MAX_CHANGED_SPEC_DOCS = 2;
/** Char cap for a LINKED spec doc (explicit body link / branch reference). */
export const MAX_SPEC_DOC_CHARS = 6000;
/** Char cap for a CHANGED-but-unlinked spec doc (D8) — smaller than a linked
 *  doc's cap per the plan's source-limits table (`≤2 × 3000`, vs `≤3 × 6000`). */
export const MAX_CHANGED_SPEC_DOC_CHARS = 3000;
/** `showFileAt` reads are capped at this many bytes — enforced by the git
 *  adapter itself (blob-size check before the read), not just truncated
 *  client-side after a potentially huge `git show` already returned. */
export const MAX_SPEC_DOC_READ_BYTES = 64 * 1024;
export const MAX_COMMIT_MESSAGE_LINES = 30;
export const MAX_COMMIT_MESSAGES_CHARS = 2000;
export const MAX_CHANGED_PATHS = 100;
/** External (Jira/Linear/other-host) refs recorded — never fetched (Q1). */
export const MAX_EXTERNAL_REFS = 5;
/** Whole user message budget; least-priority sources are dropped first when over. */
export const MAX_USER_MESSAGE_CHARS = 24_000;

/** Doc extensions eligible for `spec_doc` reading (linked OR changed-without-link). */
export const ALLOWED_SPEC_EXTENSIONS = ['.md', '.mdx', '.txt', '.rst', '.adoc'] as const;

/** A "substantive" description needs at least this many words (after stripping
 *  HTML comments and template checkboxes) to count toward `medium` confidence. */
export const MIN_DESCRIPTION_WORDS = 15;
/** A resolved linked spec/issue needs at least this much content to count
 *  toward `high` confidence. */
export const MIN_HIGH_CONFIDENCE_SOURCE_CHARS = 200;

// ---- The cheap-model call ---------------------------------------------------
export const EXTRACT_TEMPERATURE = 0;
export const EXTRACT_MAX_TOKENS = 600;
export const EXTRACT_TIMEOUT_MS = 30_000;
export const EXTRACT_MAX_RETRIES = 1;

// ---- clampExtraction bounds --------------------------------------------------
export const MAX_INTENT_SENTENCE_CHARS = 300;
export const MAX_SCOPE_ITEMS = 6;
export const MAX_SCOPE_ITEM_CHARS = 160;

/** `POST /pulls/:id/intent` rate limit — a re-derive always calls the model. */
export const POST_INTENT_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
