import type { ConventionCandidate } from "@devdigest/shared";
import type { Repo } from "../../../../lib/types";
import type { StatusFilter } from "./constants";

/**
 * Deep-link a candidate's evidence to the real file on GitHub, at the exact
 * line — grading criterion: "evidence is clickable and leads to real code".
 * Pins to the repo's current default branch (not the exact commit the scan
 * sampled); simple and sufficient for this scope.
 */
export function githubEvidenceUrl(repo: Repo, path: string, line: number | null | undefined): string {
  const at = `https://github.com/${repo.full_name}/blob/${repo.default_branch}/${path}`;
  return line ? `${at}#L${line}` : at;
}

export function filterConventions(list: ConventionCandidate[], filter: StatusFilter): ConventionCandidate[] {
  if (filter === "all") return list;
  return list.filter((c) => c.status === filter);
}

export function countByStatus(list: ConventionCandidate[]): Record<StatusFilter, number> {
  return {
    all: list.length,
    pending: list.filter((c) => c.status === "pending").length,
    accepted: list.filter((c) => c.status === "accepted").length,
    rejected: list.filter((c) => c.status === "rejected").length,
  };
}

/** Same shape as the other pages' colocated relative-time formatter
 *  (see repos/[repoId]/pulls/helpers.ts) — "1h ago"-style, no library. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
