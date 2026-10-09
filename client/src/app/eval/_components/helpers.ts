import type { EvalSuiteRunStatus, EvalSuiteRunSummary } from "@devdigest/shared";

export type MetricKey = "recall" | "precision" | "citation_accuracy";
export const METRIC_KEYS: MetricKey[] = ["recall", "precision", "citation_accuracy"];

/** Runs whose status carries metrics (`partial` keeps them — AC-78). */
const METRIC_STATUSES: ReadonlySet<EvalSuiteRunStatus> = new Set(["completed", "partial"]);
const ACTIVE_STATUSES: ReadonlySet<EvalSuiteRunStatus> = new Set(["queued", "running"]);

/** Points drop (inclusive) that raises the regression alert (AC-113). */
export const REGRESSION_THRESHOLD_PTS = 5;

export function hasMetrics(run: Pick<EvalSuiteRunSummary, "status">): boolean {
  return METRIC_STATUSES.has(run.status);
}

export function isActive(run: Pick<EvalSuiteRunSummary, "status">): boolean {
  return ACTIVE_STATUSES.has(run.status);
}

/** 0.824 -> "82%"; null -> the em dash. */
export function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/** Share as a whole 0..100 number, or null. */
export function toPts(v: number | null | undefined): number | null {
  return v == null ? null : Math.round(v * 100);
}

/** `2026-05-29T09:14:00Z` -> `2026-05-29 09:14` (UTC, so the label never depends on the viewer's zone). */
export function fmtDate(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** USD with two decimals; unknown cost is the em dash (AC-90). */
export function fmtCost(v: number | null | undefined): string | null {
  return v == null ? null : v.toFixed(2);
}

/** Newest first, by `started_at`. */
export function newestFirst<T extends { started_at: string }>(runs: readonly T[]): T[] {
  return [...runs].sort((x, y) => y.started_at.localeCompare(x.started_at));
}

/** `current - previous` in whole points; null when either side is unknown. */
export function deltaPts(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return Math.round((current - previous) * 100);
}

/** The two newest runs that have metrics: `[latest, previous | null]`. */
export function latestTwo(runs: readonly EvalSuiteRunSummary[]): [EvalSuiteRunSummary | null, EvalSuiteRunSummary | null] {
  const withMetrics = newestFirst(runs).filter(hasMetrics);
  return [withMetrics[0] ?? null, withMetrics[1] ?? null];
}

export interface Regression {
  metric: MetricKey;
  points: number;
  from: number;
  to: number;
}

/** The biggest metric drop of the newest run vs the one before it, if it is >= 5 points (AC-113). */
export function findRegression(runs: readonly EvalSuiteRunSummary[]): Regression | null {
  const [latest, prev] = latestTwo(runs);
  if (!latest || !prev) return null;
  let found: Regression | null = null;
  for (const metric of METRIC_KEYS) {
    const d = deltaPts(latest[metric], prev[metric]);
    if (d == null || -d < REGRESSION_THRESHOLD_PTS) continue;
    if (!found || -d > found.points) {
      found = { metric, points: -d, from: prev.agent_version, to: latest.agent_version };
    }
  }
  return found;
}

/** i18n key (inside `metrics`) explaining a null metric. */
export function nullReasonKey(metric: MetricKey): "nullReasonRecall" | "nullReasonPrecision" | "nullReasonCitationAccuracy" {
  if (metric === "recall") return "nullReasonRecall";
  if (metric === "precision") return "nullReasonPrecision";
  return "nullReasonCitationAccuracy";
}

/** i18n key (inside `metrics`) of a metric's label. */
export function metricLabelKey(metric: MetricKey): "recall" | "precision" | "citationAccuracy" {
  return metric === "citation_accuracy" ? "citationAccuracy" : metric;
}

/** Fixed colour per metric, shared by cards, bars and the trend chart. */
export const METRIC_COLOR: Record<MetricKey, string> = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation_accuracy: "var(--warn)",
};

/** Toggle a run in the compare selection; a third pick drops the earliest-picked one (AC-120). */
export function toggleSelection(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  const next = [...selected, id];
  return next.length > 2 ? next.slice(next.length - 2) : next;
}
