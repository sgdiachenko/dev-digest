import type { EvalSuiteRunStatus, EvalSuiteRunSummary } from "@devdigest/shared";

/** A run that has metrics worth showing: it finished (fully or with errored cases). */
export function isFinished(status: EvalSuiteRunStatus): boolean {
  return status === "completed" || status === "partial";
}

/** A run still in flight. */
export function isActive(status: EvalSuiteRunStatus): boolean {
  return status === "queued" || status === "running";
}

/** Newest first, whatever order the server returned. */
export function newestFirst<T extends { started_at: string }>(runs: readonly T[]): T[] {
  return [...runs].sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0));
}

/** The last two finished runs, newest first: the latest and the one it is compared against. */
export function latestFinishedPair(runs: readonly EvalSuiteRunSummary[]): {
  latest: EvalSuiteRunSummary | null;
  previous: EvalSuiteRunSummary | null;
} {
  const finished = newestFirst(runs).filter((r) => isFinished(r.status));
  return { latest: finished[0] ?? null, previous: finished[1] ?? null };
}

/** 0..1 -> whole percent; `null` stays `null`. */
export function toPercent(v: number | null): number | null {
  return v == null ? null : Math.round(v * 100);
}

/** Percentage-point change between two 0..1 metrics; `null` when either is unknown. */
export function deltaPoints(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return Math.round(current * 100) - Math.round(previous * 100);
}

/** Cost label as a plain number string, or `null` when unknown (C12). */
export function formatCost(v: number | null): string | null {
  return v == null ? null : v.toFixed(2);
}

/** Local date + time for a run row. */
export function formatRanAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
