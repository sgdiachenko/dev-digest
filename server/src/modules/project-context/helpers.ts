/**
 * Pure catalog rules: which tree entries are documents, how they are
 * categorised and classified. No I/O — the tokenizer is passed in.
 */
import type { ContextCategory, ContextDocStatus, GitTreeEntry, Tokenizer } from '@devdigest/shared';
import {
  ALLOWED_DOT_SEGMENT,
  EXCLUDED_SEGMENTS,
  MARKDOWN_EXT_RE,
  MAX_CATALOG_ENTRIES,
  MAX_DOC_BYTES,
  SECRET_PATTERNS,
  SYMLINK_MODE,
} from './constants.js';

/** AC-2: a Markdown file outside excluded / hidden directories. */
export function isEligiblePath(path: string): boolean {
  if (!MARKDOWN_EXT_RE.test(path)) return false;
  for (const segment of path.split('/')) {
    if ((EXCLUDED_SEGMENTS as readonly string[]).includes(segment)) return false;
    if (segment.startsWith('.') && segment !== ALLOWED_DOT_SEGMENT) return false;
  }
  return true;
}

/** AC-3: first matching rule wins — specs, then insights, else docs. */
export function categorize(path: string): ContextCategory {
  const segments = path.split('/');
  const dirs = segments.slice(0, -1).map((s) => s.toLowerCase());
  const base = (segments[segments.length - 1] ?? '').toLowerCase();
  if (path.startsWith('.devdigest/specs/') || dirs.includes('specs')) return 'specs';
  if (base === 'insights.md' || dirs.includes('insights')) return 'insights';
  return 'docs';
}

export function hasSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

/** Strict UTF-8 decode; `null` when the bytes are not valid UTF-8. */
export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export interface SkipCounts {
  symlink: number;
  non_blob: number;
  excluded: number;
  over_cap: number;
}

export interface SelectedEntries {
  entries: GitTreeEntry[];
  totalFiles: number;
  truncated: boolean;
  skipped: SkipCounts;
}

/** Code-unit path order — the one order the page shows (a database collation may differ). */
export function compareByPath(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/** Filter a recursive tree to catalogable documents, sorted by code unit, capped. */
export function selectEntries(tree: readonly GitTreeEntry[]): SelectedEntries {
  const skipped: SkipCounts = { symlink: 0, non_blob: 0, excluded: 0, over_cap: 0 };
  const eligible: GitTreeEntry[] = [];
  for (const entry of tree) {
    if (!isEligiblePath(entry.path)) skipped.excluded += 1;
    else if (entry.mode === SYMLINK_MODE) skipped.symlink += 1;
    else if (entry.type !== 'blob') skipped.non_blob += 1;
    else eligible.push(entry);
  }
  eligible.sort(compareByPath);
  const truncated = eligible.length > MAX_CATALOG_ENTRIES;
  skipped.over_cap = truncated ? eligible.length - MAX_CATALOG_ENTRIES : 0;
  return {
    entries: truncated ? eligible.slice(0, MAX_CATALOG_ENTRIES) : eligible,
    totalFiles: eligible.length,
    truncated,
    skipped,
  };
}

export interface DocClassification {
  status: ContextDocStatus;
  est_tokens: number | null;
  secret_warning: boolean;
}

/**
 * Size is checked before content: an oversized blob is never read (`bytes`
 * is null for it). `bytes: null` for a non-empty, in-limit blob means the
 * read failed → `unreadable`.
 */
export function classifyDoc(
  size: number,
  bytes: Uint8Array | null,
  tokenizer: Tokenizer,
): DocClassification {
  if (size > MAX_DOC_BYTES) return { status: 'too_large', est_tokens: null, secret_warning: false };
  if (size === 0) return { status: 'empty', est_tokens: 0, secret_warning: false };
  const text = bytes ? decodeUtf8Strict(bytes) : null;
  if (text === null) return { status: 'unreadable', est_tokens: null, secret_warning: false };
  return { status: 'ok', est_tokens: tokenizer.count(text), secret_warning: hasSecret(text) };
}
