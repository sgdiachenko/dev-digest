/**
 * Pure helpers for the pulls module — no DB, no network, no `this`.
 *
 * These carry the PR-list rules that used to sit inline in `routes.ts`, where
 * they could only be exercised through HTTP. Everything here is a plain
 * function over its arguments, so the rules are unit-testable.
 */
import type { FindingsSummary, PrMeta } from '@devdigest/shared';
import { summarizeFindings } from '../reviews/helpers.js';
import type { ReviewLite } from '../_shared/review-rounds.js';
import type { FindingsInput, Pull } from './repository.js';
import { deriveReviewStatus } from './status.js';

/**
 * Latest review per PR, by `created_at`.
 *
 * NOTE this is deliberately NOT the same rule as `findingsSummaryByPr` below:
 * `score` reflects a single review, findings sum a whole round. They can
 * legitimately disagree about which agent(s) they reflect — see INSIGHTS.md.
 */
export function latestReviewByPr(reviews: ReviewLite[]): Map<string, ReviewLite> {
  const byPr = new Map<string, ReviewLite>();
  // Caller supplies newest-first; the first row seen per PR is the latest.
  for (const rv of reviews) {
    if (!byPr.has(rv.prId)) byPr.set(rv.prId, rv);
  }
  return byPr;
}

/** Group findings by review, then fold each PR's review ids into one summary. */
export function findingsSummaryByPr(
  reviewIdsByPr: Map<string, string[]>,
  findings: FindingsInput,
): Map<string, FindingsSummary> {
  const byReviewId = new Map<string, FindingsInput>();
  for (const f of findings) {
    const list = byReviewId.get(f.reviewId) ?? [];
    list.push(f);
    byReviewId.set(f.reviewId, list);
  }

  const out = new Map<string, FindingsSummary>();
  for (const [prId, reviewIds] of reviewIdsByPr) {
    const combined = reviewIds.flatMap((id) => byReviewId.get(id) ?? []);
    out.set(prId, summarizeFindings(combined));
  }
  return out;
}

/**
 * Lifetime USD spend per PR across successful runs.
 *
 * `hasCost` is tracked separately from the numeric sum so a PR whose runs never
 * captured cost stays `null` ("we don't know") instead of rendering as $0.00.
 */
export function costByPr(
  runs: { prId: string | null; costUsd: number | null }[],
): Map<string, { sum: number; hasCost: boolean }> {
  const out = new Map<string, { sum: number; hasCost: boolean }>();
  for (const r of runs) {
    if (!r.prId) continue;
    const entry = out.get(r.prId) ?? { sum: 0, hasCost: false };
    if (r.costUsd != null) {
      entry.sum += r.costUsd;
      entry.hasCost = true;
    }
    out.set(r.prId, entry);
  }
  return out;
}

/** Row → the `PrMeta` wire DTO, with the derived review status. */
export function rowToPrMeta(
  row: Pull,
  opts: {
    score: number | null;
    cost: { sum: number; hasCost: boolean } | undefined;
    findings: FindingsSummary | null;
    now: number;
  },
): PrMeta {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    author: row.author,
    branch: row.branch,
    base: row.base,
    head_sha: row.headSha,
    additions: row.additions,
    deletions: row.deletions,
    files_count: row.filesCount,
    status: deriveReviewStatus({
      ghStatus: row.status,
      lastReviewedSha: row.lastReviewedSha,
      headSha: row.headSha,
      updatedAt: row.updatedAt,
      now: opts.now,
    }),
    opened_at: row.openedAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    score: opts.score,
    cost_usd: opts.cost?.hasCost ? opts.cost.sum : null,
    findings_summary: opts.findings,
  };
}

/** A PR is missing its diff stats when GitHub's list payload zeroed them. */
export function needsDiffStatBackfill(row: Pull): boolean {
  return row.additions === 0 && row.deletions === 0 && row.filesCount === 0;
}
