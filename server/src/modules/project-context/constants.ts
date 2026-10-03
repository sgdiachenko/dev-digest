/**
 * project-context constants. Imported across modules (repos, repo-intel) only
 * through this file — never the service/routes/repository.
 */

/** Job kind that (re)builds the catalog; enqueued after clone and after resync. */
export const CONTEXT_SCAN_JOB_KIND = 'project-context-scan';

/** A document larger than this is catalogued as `too_large` and never read. */
export const MAX_DOC_BYTES = 65_536;
/** Catalog cap; the rest is reported via `total_files` + `truncated`. */
export const MAX_CATALOG_ENTRIES = 1_000;

export const MARKDOWN_EXT_RE = /\.mdx?$/i;
/** Any path segment equal to one of these excludes the file. */
export const EXCLUDED_SEGMENTS = ['node_modules', 'vendor', '.git'] as const;
/** Every other dot-segment excludes the file, except this one. */
export const ALLOWED_DOT_SEGMENT = '.devdigest';
/** git tree mode of a symlink — never followed, never catalogued. */
export const SYMLINK_MODE = '120000';

/** A `scanning` row older than this is treated as an interrupted scan. */
export const STALE_SCAN_MS = 10 * 60_000;
/** Yield to the event loop every N documents read (tokenizer is synchronous). */
export const SCAN_YIELD_EVERY = 25;

/** Heuristic secret markers; a hit only sets a warning flag, never blocks. */
export const SECRET_PATTERNS: readonly RegExp[] = [
  /sk_live_[0-9A-Za-z]{8,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /service_role/,
];
