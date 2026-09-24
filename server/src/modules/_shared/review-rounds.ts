/**
 * "Which reviews count as a PR's latest round" — shared by `pulls` (the
 * findings_summary shown in the PR list) and `smart-diff` (finding_ids per
 * file). Lives here, not in either module's own `helpers.ts`, so neither one
 * imports the other's files (onion-architecture: no-sideways-module-imports
 * exempts `_shared`).
 */
import { latestRoundRunIds } from '../reviews/helpers.js';

export interface ReviewLite {
  id: string;
  prId: string;
  runId: string | null;
  score: number | null;
  createdAt: Date;
}

export interface RunLite {
  id: string;
  prId: string | null;
  ranAt: Date;
}

/**
 * Which review ids count toward each PR's findings summary.
 *
 * With runs: every review whose run falls in the PR's most recent ROUND (one
 * "Review all" click fans out to several agents that finish seconds apart, so
 * "the single newest review" would silently drop the others).
 * Without runs (e.g. a hand-seeded review): the single latest review, matching
 * `score`'s fallback.
 */
export function reviewIdsForFindings(
  prIds: string[],
  runs: RunLite[],
  reviews: ReviewLite[],
): Map<string, string[]> {
  const runsByPr = new Map<string, { id: string; ranAt: Date }[]>();
  for (const r of runs) {
    if (!r.prId) continue;
    const list = runsByPr.get(r.prId) ?? [];
    list.push({ id: r.id, ranAt: r.ranAt });
    runsByPr.set(r.prId, list);
  }

  const out = new Map<string, string[]>();
  for (const prId of prIds) {
    const prRuns = runsByPr.get(prId);
    if (prRuns && prRuns.length > 0) {
      const roundIds = latestRoundRunIds(prRuns);
      const matched = reviews.filter(
        (rv) => rv.prId === prId && rv.runId != null && roundIds.has(rv.runId),
      );
      if (matched.length > 0) out.set(prId, matched.map((rv) => rv.id));
      continue;
    }
    const prReviews = reviews
      .filter((rv) => rv.prId === prId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (prReviews[0]) out.set(prId, [prReviews[0].id]);
  }
  return out;
}
