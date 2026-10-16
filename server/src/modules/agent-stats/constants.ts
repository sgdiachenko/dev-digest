const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Run-history page size (fixed on the wire: `page_size` is the literal 20). */
export const RUN_HISTORY_PAGE_SIZE = 20;

/** `last_runs` per agent row. */
export const LAST_RUNS_LIMIT = 5;

/** A bucket size valid for periods up to `maxSpanMs` (inclusive). */
export interface BucketTier {
  maxSpanMs: number;
  sizeMs: number;
}

/** Runs trend: 1h up to 2 days, 1d up to 90 days, 7d beyond. */
export const TREND_BUCKETS: readonly BucketTier[] = [
  { maxSpanMs: 2 * DAY_MS, sizeMs: HOUR_MS },
  { maxSpanMs: 90 * DAY_MS, sizeMs: DAY_MS },
  { maxSpanMs: Number.POSITIVE_INFINITY, sizeMs: 7 * DAY_MS },
];

/** Findings by severity: 4h up to 2 days, 1d up to 14, 7d up to 120, 30d beyond. */
export const SEVERITY_BUCKETS: readonly BucketTier[] = [
  { maxSpanMs: 2 * DAY_MS, sizeMs: 4 * HOUR_MS },
  { maxSpanMs: 14 * DAY_MS, sizeMs: DAY_MS },
  { maxSpanMs: 120 * DAY_MS, sizeMs: 7 * DAY_MS },
  { maxSpanMs: Number.POSITIVE_INFINITY, sizeMs: 30 * DAY_MS },
];
