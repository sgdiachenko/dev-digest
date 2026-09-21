import { MAX_PROBE_CHARS, MIN_SUPPORT_FILES, SUPPORT_CONFIDENCE_BANDS } from './constants.js';

/**
 * Lever B — frequency grounding.
 *
 * A cheap model's self-reported confidence is badly calibrated (see
 * docs/agent-prompts/choosing-a-model.md on severity inflation). This module
 * replaces it with a count the machine can make: how many DISTINCT files
 * repo-wide match the candidate's probe. The orchestration (actually calling
 * `CodeIndex.grep`) lives in service.ts — this file is pure: it decides what
 * string is safe to search for, and what a support count means.
 */

/** Escape every regex metacharacter — the probe is a LITERAL substring, never
 *  a pattern. An escaped literal runs in linear time in any regex engine, so
 *  this is what actually neutralizes the ReDoS surface: `CodeIndex.grep`'s
 *  Node fallback runs the pattern through `new RegExp(pattern)` with no
 *  timeout, and the probe originates from the model's (untrusted) response. */
export function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The longest trimmed, non-empty line of a snippet — used when the model's
 *  own probe is missing or unusable, so there is always something to search for. */
function longestLine(snippet: string): string {
  const lines = snippet
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return snippet.trim();
  return lines.reduce((best, l) => (l.length > best.length ? l : best), lines[0]!);
}

/**
 * Build the actual grep pattern for a verified candidate. Never trusts the
 * model's `probe` directly: rejects it when empty or absurdly long (a whole
 * paragraph is not a "distinctive token"), falls back to the evidence
 * snippet's longest line, and ALWAYS escapes the result before it is used as
 * a regex — see `escapeRegexLiteral`.
 */
export function buildProbePattern(probe: string | null, evidenceSnippet: string): string {
  const raw = (probe ?? '').trim();
  const source = raw.length > 0 && raw.length <= MAX_PROBE_CHARS ? raw : longestLine(evidenceSnippet);
  return escapeRegexLiteral(source).slice(0, MAX_PROBE_CHARS * 2); // escaping can double length worst-case
}

/**
 * Confidence from a real, repo-wide occurrence count — this REPLACES the
 * model's self-reported number for `origin: 'model'` candidates. Returns
 * `null` when the pattern is too rare to call a convention (one occurrence is
 * a coincidence): the caller drops that candidate as `dropped_unsupported`.
 */
export function confidenceFromSupport(distinctFiles: number): number | null {
  if (distinctFiles < MIN_SUPPORT_FILES) return null;
  for (const band of SUPPORT_CONFIDENCE_BANDS) {
    if (distinctFiles >= band.min) return band.confidence;
  }
  return null;
}
