import type { AgentPerf } from "@devdigest/shared";
import { ApiError } from "@/lib/api";

export type DashboardState = "pending" | "invalid" | "error" | "noAgents" | "noReviews" | "noRuns" | "data";

/** A 422 means the server rejected the period (AC-176). */
export function isInvalidPeriod(error: unknown): boolean {
  return error instanceof ApiError && error.status === 422;
}

/**
 * Which body the dashboard shows. `shown` is the response to render (the current period's data, or
 * the previous period's cached data bridging a preset refresh); `error` is the query's error.
 * An invalid period shows no figures; a failed load with nothing to show is an error panel;
 * with something to show the figures stay and only a banner reports the failure.
 */
export function dashboardState(args: { shown: AgentPerf | undefined; error: unknown }): DashboardState {
  const { shown, error } = args;
  if (isInvalidPeriod(error)) return "invalid";
  if (!shown) return error ? "error" : "pending";
  if (shown.summary.agent_count === 0) return "noAgents";
  if (shown.summary.workspace_last_run_at == null) return "noReviews";
  if (shown.summary.runs === 0) return "noRuns";
  return "data";
}
