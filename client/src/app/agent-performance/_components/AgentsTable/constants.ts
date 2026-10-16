import type { SortKey } from "./helpers";

/** Rows rendered at most; the rest is summarised as "Showing 200 of n agents" (NFR-7). */
export const ROW_CAP = 200;

/** Columns in display order; `label` is the `dashboard.table.*` catalog key. */
export const COLUMNS: { key: SortKey; label: "agent" | "runs" | "avgCost" | "avgDuration" | "accept" | "lastRun" }[] = [
  { key: "agent", label: "agent" },
  { key: "runs", label: "runs" },
  { key: "avg_cost", label: "avgCost" },
  { key: "avg_duration", label: "avgDuration" },
  { key: "accept", label: "accept" },
  { key: "last_run", label: "lastRun" },
];

export const COLUMN_COUNT = COLUMNS.length + 1;
