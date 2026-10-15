/**
 * Stats rules shared by `agent-stats` (the Agent Performance dashboard and the
 * agent Stats tab) and `skills` (the skill Stats tab), so the two specs give
 * the same numbers for the same fixed period. Pure, no I/O. Lives here, not in
 * either module's own files, so neither one imports the other
 * (onion-architecture: no-sideways-module-imports exempts `_shared`).
 */

/** Run statuses that count toward every figure; `running` is only counted as in progress. */
export const COUNTED_STATUSES = ['done', 'failed', 'cancelled'] as const;
export type CountedStatus = (typeof COUNTED_STATUSES)[number];

/** Only local review runs count; CI and eval runs are not review runs. */
export const REVIEW_RUN_SOURCE = 'local' as const;

/** Fewer decided findings (accepted + dismissed) than this is a small sample. */
export const SMALL_SAMPLE_MIN_DECIDED = 10;

/** 366 calendar days plus daylight-saving slack. */
export const MAX_PERIOD_MS = 367 * 86_400_000;

/**
 * Why a `[from, to)` period is not acceptable, or `null` when it is. Checks, in
 * order: both parse, `from` before `to`, `from` not in the future, span within
 * `MAX_PERIOD_MS`.
 */
export function periodIssue(fromIso: string, toIso: string, nowMs: number): string | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 'from and to must be ISO-8601 timestamps';
  if (from >= to) return 'from must be before to';
  if (from > nowMs) return 'from must not be in the future';
  if (to - from > MAX_PERIOD_MS) return 'the period must not exceed 367 days';
  return null;
}

/** accepted / (accepted + dismissed) as 0..1, null with nothing decided; small sample under 10 decided. */
export function acceptFigures(
  accepted: number,
  dismissed: number,
): { accept_rate: number | null; small_sample: boolean } {
  const decided = accepted + dismissed;
  return {
    accept_rate: decided === 0 ? null : accepted / decided,
    small_sample: decided < SMALL_SAMPLE_MIN_DECIDED,
  };
}

/** A share (0..1) as a whole percent, halves up. */
export function wholePercent(share: number): number {
  return Math.round(share * 100);
}

/**
 * A "recorded skill list" is a JSON array whose elements are all strings
 * (`trace.config.skills`). Anything else — absent, null, an object, an array
 * with a non-string — means the run has no skill data and never fails a read.
 */
export function isRecordedSkillList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}
