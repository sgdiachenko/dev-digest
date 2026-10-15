import type { SkillStats } from "@devdigest/shared";
import { ApiError } from "../../../../../../../../lib/api";

export type SkillTabState = "pending" | "invalid" | "notFound" | "error" | "noUsage" | "noRuns" | "figures";

export function isApiStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}

/**
 * Which body the tab shows. 422 and 404 win over any cached figures; a failed refresh with
 * figures in hand keeps them (the banner says so); otherwise the figures decide between the
 * two empty states (skill AC-33, AC-34) and the full tab.
 */
export function skillTabState(query: { isError: boolean; error: unknown }, stats: SkillStats | undefined): SkillTabState {
  if (query.isError && isApiStatus(query.error, 422)) return "invalid";
  if (query.isError && isApiStatus(query.error, 404)) return "notFound";
  if (!stats) return query.isError ? "error" : "pending";
  if (stats.agent_count === 0 && stats.skill_runs === 0) return "noUsage";
  if (stats.agent_count > 0 && stats.skill_runs === 0 && stats.pull_runs_total === 0) return "noRuns";
  return "figures";
}
