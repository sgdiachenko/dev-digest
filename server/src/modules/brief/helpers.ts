/**
 * PR Brief — pure helpers: no DB, no network, no `this`. Everything that
 * decides WHAT the model may be told and WHAT of its answer is kept lives here
 * so it is unit-testable without a fixture LLM.
 */
import {
  PrBriefRecord,
  type BlastRadius,
  type BlastRadiusResponse,
  type BriefMissingReason,
  type ReviewFocusItem,
  type Risk,
  type RiskSeverity,
} from '@devdigest/shared';
import { z } from 'zod';
import { TimeoutError } from '../../platform/resilience.js';
import type { RepoContextResult } from '../context-attachments/types.js';
import { extractReferences } from '../intent/helpers.js';
import {
  MAX_BLAST_SUMMARY_CHARS,
  MAX_EXPLANATION_CHARS,
  MAX_FOCUS_ITEMS,
  MAX_REASON_CHARS,
  MAX_REFS_PER_RISK,
  MAX_RISK_TITLE_CHARS,
  MAX_RISKS,
  MAX_SUMMARY_CHARS,
  RISK_KINDS,
  STORED_SCHEMA_VERSION,
} from './constants.js';

// ============================================================ Errors

/** The model answered, but nothing usable came back (empty summary, bad shape). */
export class InvalidBriefOutputError extends Error {
  override readonly name = 'InvalidBriefOutputError';
}

/** Even after every reduction step the input does not fit the budget (guard; unreachable under the caps). */
export class BriefInputOverBudgetError extends Error {
  override readonly name = 'BriefInputOverBudgetError';
  constructor(readonly estTokens: number) {
    super('brief input exceeds the token budget');
  }
}

export type BriefFailureReason = 'llm_timeout' | 'llm_error' | 'invalid_output';

/** Maps an LLM-call failure to the response reason by error name (messages are never echoed). */
export function classifyBriefFailure(err: unknown): BriefFailureReason {
  const name = err instanceof Error ? err.name : '';
  if (
    err instanceof TimeoutError ||
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    name === 'APIConnectionTimeoutError'
  ) {
    return 'llm_timeout';
  }
  if (
    err instanceof z.ZodError ||
    err instanceof SyntaxError ||
    err instanceof InvalidBriefOutputError ||
    name === 'InvalidBriefOutputError' ||
    name === 'ZodError' ||
    name === 'SyntaxError'
  ) {
    return 'invalid_output';
  }
  const message = err instanceof Error ? err.message : '';
  if (/schema|no choices|empty (response|output)/i.test(message)) return 'invalid_output';
  return 'llm_error';
}

// ============================================================ Diff ranges

export interface LineRange {
  start: number;
  end: number;
}

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Contiguous new-side ranges of ADDED (`+`) lines in one file's patch.
 * Context lines advance the counter but are not part of a range; deleted
 * lines have no new-side number. `null` / binary / deletions-only → `[]`.
 */
export function addedLineRanges(patch: string | null): LineRange[] {
  if (!patch) return [];
  const ranges: LineRange[] = [];
  let newNo = 0;
  let inHunk = false;
  let current: LineRange | null = null;
  const close = () => {
    if (current) ranges.push(current);
    current = null;
  };
  for (const line of patch.split('\n')) {
    const header = HUNK_HEADER_RE.exec(line);
    if (header) {
      close();
      newNo = Number(header[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    const marker = line[0];
    if (marker === '+') {
      if (current && current.end === newNo - 1) current.end = newNo;
      else {
        close();
        current = { start: newNo, end: newNo };
      }
      newNo += 1;
    } else if (marker === '-' || marker === '\\') {
      // deleted line / "\ No newline at end of file": no new-side line, so adjacency is unaffected
    } else {
      close();
      newNo += 1;
    }
  }
  close();
  return ranges;
}

// ============================================================ Linked issue

/** The first same-repo issue/PR number the PR references (title, body, URLs), or null. */
export function pickLinkedIssueNumber(
  pull: { title: string; body: string | null; branch: string },
  repo: { owner: string; name: string },
): number | null {
  const refs = extractReferences({
    title: pull.title,
    body: pull.body,
    branch: pull.branch,
    repoOwner: repo.owner,
    repoName: repo.name,
  });
  return refs.linkedIssueNumbers[0] ?? null;
}

// ============================================================ Blast projection

/**
 * The single blast shape the prompt, the stored brief and the path allow-list
 * all work with: summary (capped), changed symbols (name, file, kind) and
 * callers (name, file, line). Endpoint/cron lists are not sent, so they are `[]`.
 */
export function projectBlast(response: BlastRadiusResponse): BlastRadius {
  return {
    summary: truncateText(response.summary, MAX_BLAST_SUMMARY_CHARS),
    changed_symbols: response.changed_symbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream: response.downstream.map((d) => ({
      symbol: d.symbol,
      callers: d.callers.map((c) => ({
        name: c.name,
        file: c.file,
        line: c.line,
        endpoints_affected: [],
        crons_affected: [],
      })),
      endpoints_affected: [],
      crons_affected: [],
    })),
  };
}

/** Every file the (already projected / trimmed) blast mentions. */
export function blastPathsOf(blast: BlastRadius | null): Set<string> {
  const paths = new Set<string>();
  if (!blast) return paths;
  for (const s of blast.changed_symbols) paths.add(s.file);
  for (const d of blast.downstream) for (const c of d.callers) paths.add(c.file);
  return paths;
}

// ============================================================ Missing inputs

export type BlastOutcome =
  | { kind: 'ok'; degraded: boolean; reason: BlastRadiusResponse['reason'] }
  | { kind: 'timeout' }
  | { kind: 'error' };

/** Why the blast radius is not usable, or `null` when it is. */
export function blastMissingReason(outcome: BlastOutcome): BriefMissingReason | null {
  if (outcome.kind === 'timeout') return 'timeout';
  if (outcome.kind === 'error') return 'unavailable';
  if (!outcome.degraded) return null;
  return outcome.reason ?? 'no_data';
}

/**
 * Why attached specs are missing, or `null` when at least one is available.
 * The context-attachments service already applies the priority
 * `no_clone` > `no_catalog` > `none`.
 */
export function specsMissingReason(result: RepoContextResult): BriefMissingReason | null {
  switch (result.kind) {
    case 'none':
      return 'none_attached';
    case 'unavailable':
      if (result.reason === 'no_clone') return 'not_cloned';
      if (result.reason === 'no_catalog') return 'no_catalog';
      return 'unavailable';
    case 'resolved':
      return result.docs.length === 0 ? 'none_attached' : null;
  }
}

// ============================================================ Output validation

/** Structural view of the model's output (the strict-safe schema lives in prompt.ts). */
export interface RawBriefOutput {
  summary: string;
  risks: { kind: string; title: string; explanation: string; severity: RiskSeverity; file_refs: string[] }[];
  review_focus: { file: string; line: number; reason: string }[];
}

export interface ValidationContext {
  /** The PR's stored changed-file paths. */
  prPaths: ReadonlySet<string>;
  /** Files of the blast projection that was actually sent. */
  blastPaths: ReadonlySet<string>;
  /** New-side added-line ranges per PR file (absent / empty = unverifiable). */
  rangesByPath: ReadonlyMap<string, readonly LineRange[]>;
}

export interface ValidatedBrief {
  summary: string;
  risks: Risk[];
  review_focus: ReviewFocusItem[];
  /** Counts only — safe to log. */
  dropped: { refs: number; risks: number; focus: number };
}

/** Truncates to `max` characters, ending with "…" when something was cut. */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

const REF_PATH_RE = /^(.*?)(?::\d+(?:-\d+)?)?$/;
const refPath = (ref: string): string => REF_PATH_RE.exec(ref)?.[1] ?? ref;

const SEVERITY_RANK: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
const KNOWN_KINDS: ReadonlySet<string> = new Set(RISK_KINDS);

function normalizeFocusLine(
  line: number,
  ranges: readonly LineRange[] | undefined,
): { line: number; verified: boolean } {
  if (ranges && ranges.length > 0) {
    const inside = line >= 1 && ranges.some((r) => line >= r.start && line <= r.end);
    return { line: inside ? line : ranges[0]!.start, verified: true };
  }
  return { line: line >= 1 ? line : 1, verified: false };
}

/**
 * Applies every post-parse rule to the model's output: path allow-list,
 * dropping ref-less risks, kind coercion, severity sort, caps, line snapping,
 * dedup and truncation. Never throws; an empty result still carries the summary.
 */
export function validateBriefOutput(output: RawBriefOutput, ctx: ValidationContext): ValidatedBrief {
  const allowed = (path: string) => ctx.prPaths.has(path) || ctx.blastPaths.has(path);
  const dropped = { refs: 0, risks: 0, focus: 0 };

  const kept: Risk[] = [];
  for (const risk of output.risks) {
    const refs: string[] = [];
    for (const ref of risk.file_refs) {
      if (!allowed(refPath(ref))) dropped.refs += 1;
      else if (!refs.includes(ref)) refs.push(ref);
    }
    if (refs.length === 0) {
      dropped.risks += 1;
      continue;
    }
    kept.push({
      kind: KNOWN_KINDS.has(risk.kind) ? risk.kind : 'other',
      title: truncateText(risk.title, MAX_RISK_TITLE_CHARS),
      explanation: truncateText(risk.explanation, MAX_EXPLANATION_CHARS),
      severity: risk.severity,
      file_refs: refs.slice(0, MAX_REFS_PER_RISK),
    });
  }
  // Array.prototype.sort is stable: equal severities keep the model's order.
  const risks = [...kept].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  dropped.risks += Math.max(0, risks.length - MAX_RISKS);

  const focus: ReviewFocusItem[] = [];
  const seen = new Set<string>();
  for (const item of output.review_focus) {
    if (!ctx.prPaths.has(item.file)) {
      dropped.focus += 1;
      continue;
    }
    const { line, verified } = normalizeFocusLine(item.line, ctx.rangesByPath.get(item.file));
    const key = `${item.file}:${line}`;
    if (seen.has(key)) {
      dropped.focus += 1;
      continue;
    }
    seen.add(key);
    focus.push({
      file: item.file,
      line,
      reason: truncateText(item.reason, MAX_REASON_CHARS),
      line_verified: verified,
    });
  }
  dropped.focus += Math.max(0, focus.length - MAX_FOCUS_ITEMS);

  return {
    summary: truncateText(output.summary, MAX_SUMMARY_CHARS),
    risks: risks.slice(0, MAX_RISKS),
    review_focus: focus.slice(0, MAX_FOCUS_ITEMS),
    dropped,
  };
}

// ============================================================ Stored document

/** What `pr_brief.json` holds: the record minus the per-request fields, plus a schema version. */
export const StoredBrief = PrBriefRecord.omit({ pr_id: true, stale: true }).extend({
  schema_version: z.literal(STORED_SCHEMA_VERSION),
});
export type StoredBrief = z.infer<typeof StoredBrief>;

/** `null` for anything that is not a current-version, well-formed document (older schema, corrupted JSON). */
export function parseStoredBrief(json: unknown): StoredBrief | null {
  const parsed = StoredBrief.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** The wire record: the stored document plus `pr_id` and `stale` (head SHA moved on). */
export function toBriefRecord(prId: string, stored: StoredBrief, currentHeadSha: string): PrBriefRecord {
  const { schema_version: _version, ...rest } = stored;
  return { ...rest, pr_id: prId, stale: stored.head_sha !== currentHeadSha };
}
