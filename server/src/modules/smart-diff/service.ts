/**
 * D2 — Smart Diff use case. No repository of its own: `SmartDiffStore` is a
 * subset of `PullsRepository`'s public shape, declared here by the consumer
 * (onion-architecture: service-takes-ports-not-concrete-repository) — the
 * container's memoized `pullsRepo` satisfies it structurally.
 */
import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { reviewIdsForFindings, type ReviewLite, type RunLite } from '../_shared/review-rounds.js';
import { buildSmartDiff, type SmartDiffFileInput, type SmartDiffFindingInput } from './helpers.js';

/**
 * What this service needs from persistence — declared HERE (the consumer),
 * not by importing `PullsRepository` as a value/type from another module's
 * `repository.ts` (onion-architecture: service-takes-ports-not-concrete-
 * repository, and `no-sideways-module-imports`). The container's memoized
 * `pullsRepo` (a `PullsRepository`) satisfies this structurally — no
 * repository file of this module's own (D2).
 */
export interface SmartDiffStore {
  findPull(workspaceId: string, prId: string): Promise<{ id: string } | undefined>;
  listFiles(prId: string): Promise<SmartDiffFileInput[]>;
  listReviewsForPulls(prIds: string[]): Promise<ReviewLite[]>;
  listRunsForPulls(prIds: string[]): Promise<RunLite[]>;
  listFindingsForReviews(reviewIds: string[]): Promise<SmartDiffFindingInput[]>;
}

export class SmartDiffService {
  constructor(private readonly repo: SmartDiffStore) {}

  /**
   * D3 — findings come from the PR's latest review ROUND
   * (`reviewIdsForFindings`, the same rule the PR list's `findings_summary`
   * uses — one "review all" click's agents, not a single review), never
   * called at all when the PR has no reviews yet (an empty round costs zero
   * extra reads). Dismissed findings are dropped inside `buildSmartDiff`;
   * accepted ones stay.
   */
  async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.repo.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, reviews, runs] = await Promise.all([
      this.repo.listFiles(prId),
      this.repo.listReviewsForPulls([prId]),
      this.repo.listRunsForPulls([prId]),
    ]);

    const reviewIds = reviewIdsForFindings([prId], runs, reviews).get(prId) ?? [];
    const findings = reviewIds.length > 0 ? await this.repo.listFindingsForReviews(reviewIds) : [];

    return buildSmartDiff(files, findings);
  }
}
