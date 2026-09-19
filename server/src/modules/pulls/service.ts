import type { GitHubClient, PrDetail, PrMeta, PrReviewComment } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { Pull, PullsRepository, RepoRow } from './repository.js';
import {
  costByPr,
  findingsSummaryByPr,
  latestReviewByPr,
  needsDiffStatBackfill,
  reviewIdsForFindings,
  rowToPrMeta,
} from './helpers.js';

/**
 * F1 — pulls use cases.
 *
 * Local-first throughout: GitHub is an enrichment, never a hard dependency. A
 * missing token or an offline network degrades to the persisted rows rather
 * than failing the read, so a seeded/imported PR stays viewable.
 *
 * Takes its two ports explicitly (repository + a GitHub client factory) rather
 * than the DI container, so its real dependencies are visible in the signature
 * and it can be constructed in a test with two stubs.
 */

/** Each diff-stat backfill costs a GitHub detail fetch, so cap it per request;
 *  the list's periodic refetch chips away at any remainder. */
const BACKFILL_LIMIT = 10;

/** Minimal logger surface — `req.log` and `app.log` both satisfy it. */
export interface ServiceLogger {
  warn(obj: unknown, msg?: string): void;
}

export class PullsService {
  constructor(
    private readonly repo: PullsRepository,
    private readonly github: () => Promise<GitHubClient>,
  ) {}

  /** GitHub client, or null when no token is configured / it cannot be built. */
  private async githubOrNull(log: ServiceLogger): Promise<GitHubClient | null> {
    try {
      return await this.github();
    } catch (err) {
      log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted data');
      return null;
    }
  }

  async listForRepo(workspaceId: string, repoId: string, log: ServiceLogger): Promise<PrMeta[]> {
    const repo = await this.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.githubOrNull(log);
    if (gh) await this.syncFromGitHub(workspaceId, repo, gh, log);

    const rows = await this.repo.listPullsByRepo(repo.id);
    if (gh) await this.backfillDiffStats(repo, rows, gh, log);

    return this.decorate(rows);
  }

  /** Import/refresh the repo's PRs. Never throws — a sync failure serves what we have. */
  private async syncFromGitHub(
    workspaceId: string,
    repo: RepoRow,
    gh: GitHubClient,
    log: ServiceLogger,
  ): Promise<void> {
    try {
      const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
      for (const pr of pulls) {
        await this.repo.upsertPull(workspaceId, repo.id, pr);
      }
    } catch (err) {
      log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
    }
  }

  /**
   * Diff stats are absent from GitHub's PR-LIST payload, so freshly imported PRs
   * land with zeroed size. Backfill from the detail endpoint so the list shows
   * real S/M/L + ± counts. Mutates `rows` so the response reflects the backfill
   * without a re-read.
   */
  private async backfillDiffStats(
    repo: RepoRow,
    rows: Pull[],
    gh: GitHubClient,
    log: ServiceLogger,
  ): Promise<void> {
    const pending = rows.filter(needsDiffStatBackfill).slice(0, BACKFILL_LIMIT);
    for (const row of pending) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, row.number);
        const stats = {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        };
        await this.repo.updateDiffStats(row.id, stats);
        Object.assign(row, stats);
      } catch (err) {
        log.warn({ err, number: row.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  /** Attach score / findings / cost to each row. Pure reads + pure folding. */
  private async decorate(rows: Pull[]): Promise<PrMeta[]> {
    const prIds = rows.map((r) => r.id);
    const [reviews, runs, costRuns] = await Promise.all([
      this.repo.listReviewsForPulls(prIds),
      this.repo.listRunsForPulls(prIds),
      this.repo.listDoneRunCosts(prIds),
    ]);

    const scoreByPr = latestReviewByPr(reviews);
    const reviewIdsByPr = reviewIdsForFindings(prIds, runs, reviews);
    const findings = await this.repo.listFindingsForReviews([...reviewIdsByPr.values()].flat());
    const summaries = findingsSummaryByPr(reviewIdsByPr, findings);
    const costs = costByPr(costRuns);

    const now = Date.now();
    return rows.map((row) =>
      rowToPrMeta(row, {
        score: scoreByPr.get(row.id)?.score ?? null,
        cost: costs.get(row.id),
        findings: summaries.get(row.id) ?? null,
        now,
      }),
    );
  }

  // ---- detail --------------------------------------------------------------

  async getDetail(workspaceId: string, prId: string, log: ServiceLogger): Promise<PrDetail> {
    const { pr, repo } = await this.resolve(workspaceId, prId);

    try {
      const gh = await this.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.repo.replacePullDetail(pr.id, detail.files, detail.commits, {
        body: detail.body ?? null,
        // Diff stats aren't on GitHub's PR-list payload — backfill them from
        // this detail fetch so the list shows real size/files too.
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });
      return { ...detail, id: pr.id };
    } catch (err) {
      log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      return this.persistedDetail(pr);
    }
  }

  /** The offline view: whatever files/commits/body were last persisted. */
  private async persistedDetail(pr: Pull): Promise<PrDetail> {
    const [files, commits] = await Promise.all([
      this.repo.listFiles(pr.id),
      this.repo.listCommits(pr.id),
    ]);
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      branch: pr.branch,
      base: pr.base,
      head_sha: pr.headSha,
      additions: pr.additions,
      deletions: pr.deletions,
      files_count: pr.filesCount,
      status: pr.status as PrDetail['status'],
      opened_at: pr.openedAt?.toISOString() ?? null,
      updated_at: pr.updatedAt?.toISOString() ?? null,
      body: pr.body ?? null,
      files,
      commits: commits.map((c) => ({
        sha: c.sha,
        message: c.message,
        author: c.author,
        committed_at: c.committedAt?.toISOString() ?? null,
      })),
    };
  }

  // ---- inline review comments (proxied live to GitHub) ---------------------

  async listComments(
    workspaceId: string,
    prId: string,
    log: ServiceLogger,
  ): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolve(workspaceId, prId);
    const gh = await this.githubOrNull(log);
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: {
      path: string;
      line: number;
      body: string;
      side?: string | undefined;
      in_reply_to?: number | null | undefined;
    },
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolve(workspaceId, prId);

    let gh: GitHubClient;
    try {
      gh = await this.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }

    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side as 'LEFT' | 'RIGHT' } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }

  private async resolve(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: Pull; repo: RepoRow }> {
    const pr = await this.repo.findPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.findRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }
}
