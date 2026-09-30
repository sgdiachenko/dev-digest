import type { LogLine } from "@devdigest/ui";
import type { ProjectContextSkipReason, RunTrace } from "@devdigest/shared";

interface RawEvent {
  t: string;
  kind: string;
  msg: string;
}

/** Map run-bus events to the LiveLogStream LogLine shape. */
export function eventsToLog(events: RawEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}

/** Map a persisted trace's log to the LiveLogStream LogLine shape. */
export function traceLog(trace: RunTrace | undefined): LogLine[] {
  return trace?.log.map((l) => ({ t: l.t, k: l.kind as LogLine["k"], m: l.msg })) ?? [];
}

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

/** Compact USD cost (e.g. "$0.06"); "—" when unknown (no data, or a failed run). */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  const rounded = Number(usd.toPrecision(2));
  return `$${rounded >= 1 ? rounded.toFixed(2) : String(rounded)}`;
}

/**
 * Rough per-block token estimate for the prompt-assembly drawer (chars/4 —
 * the real tokenizer used for cost/`trace.stats.tokens_in` runs server-side
 * only, via TiktokenTokenizer; this is a client-side approximation for "how
 * much did this block add", not the billed count). Null/empty → 0, so an
 * absent optional block (e.g. no skills linked) never shows a token count.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

const HEADING_PREFIX = "### ";
const WRAP_OPEN = '<untrusted source="spec:';
const WRAP_CLOSE = "</untrusted>";

/**
 * Real `### <path>` headings of a rendered Project context block, as
 * `{ line, path }` (line = index in `text.split("\n")`). Document text is
 * untrusted and may contain its own `### …` lines, so only a heading that is
 * directly followed by a `<untrusted source="spec:…">` wrapper counts, and
 * everything between that wrapper and its closing tag is skipped (the server
 * escapes a literal closing tag inside a document, so the first one ends it).
 */
export function projectContextHeadingLines(text: string | null | undefined): { line: number; path: string }[] {
  if (!text) return [];
  const lines = text.split("\n");
  const out: { line: number; path: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.startsWith(HEADING_PREFIX) && lines[i + 1]?.startsWith(WRAP_OPEN)) {
      out.push({ line: i, path: line.slice(HEADING_PREFIX.length) });
      i += 2;
      while (i < lines.length && lines[i] !== WRAP_CLOSE) i++;
    }
    i++;
  }
  return out;
}

/** Document paths of the `### ` headings in a Project context block, in order. */
export function projectContextHeadings(text: string | null | undefined): string[] {
  return projectContextHeadingLines(text).map((h) => h.path);
}

export interface SkippedDoc {
  path: string;
  reason: ProjectContextSkipReason;
}

/** Documents the run resolved but did not inject, with the reason. */
export function projectContextSkipped(trace: RunTrace): SkippedDoc[] {
  return (trace.project_context?.docs ?? [])
    .filter((d) => d.status === "skipped")
    .map((d) => ({ path: d.path, reason: d.reason ?? "unreadable" }));
}

/** Short (7-char) commit sha for display. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
