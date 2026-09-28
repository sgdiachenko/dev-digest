/**
 * S3 — "Prior PRs touching these files" use case (P3/E5-E7). Reads GitHub's
 * REST history directly (E6) — the `pull_requests` table only holds PRs
 * already imported into DevDigest, not a repo's full merge history.
 *
 * No repository of its own: narrow ports declared HERE (onion-architecture:
 * service-takes-ports-not-concrete-repository), same pattern as
 * `modules/blast/service.ts`'s `BlastStore`/`BlastIntel`. The container's
 * memoized `pullsRepo` satisfies both `PrHistoryStore` and `PrHistoryRepos`
 * structurally; `github()` satisfies `PrHistorySource` structurally.
 */
import type { PrHistory, PrHistoryItem, RepoRef } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';

/** E7 — explicit P3 limits: no cache, no rate-limit-header awareness. Worst
 *  case MAX_FILES * MAX_COMMITS_PER_FILE (25) GitHub calls to list commits,
 *  plus one `listPullRequestsForCommit` per commit (≤30 total), PER SECTION
 *  EXPANSION (not per render — the client only calls this once the collapsible
 *  section is opened, and TanStack Query caches the result after that). */
const MAX_FILES = 5;
const MAX_COMMITS_PER_FILE = 5;
const MAX_RESULTS = 10;

/** What this service needs from persistence — declared HERE, not imported
 *  from `../pulls/repository.js` (onion-architecture: `no-sideways-module-
 *  imports`). The container's memoized `pullsRepo` satisfies this structurally. */
export interface PrHistoryStore {
  findPull(workspaceId: string, prId: string): Promise<{ number: number; repoId: string } | undefined>;
  listFiles(prId: string): Promise<{ path: string }[]>;
}

export interface PrHistoryRepos {
  findRepoById(repoId: string): Promise<{ owner: string; name: string } | undefined>;
}

/** The two GitHub REST reads this use case needs — a narrow slice of
 *  `GitHubClient` (E6), not the whole port. */
export interface PrHistorySource {
  listCommitsForPath(repo: RepoRef, path: string, perPage: number): Promise<{ sha: string }[]>;
  listPullRequestsForCommit(
    repo: RepoRef,
    sha: string,
  ): Promise<{ number: number; title: string; merged_at: string | null; author: string }[]>;
}

export class PrHistoryService {
  constructor(
    private readonly repo: PrHistoryStore,
    private readonly repos: PrHistoryRepos,
    private readonly source: PrHistorySource,
  ) {}

  async getHistory(workspaceId: string, prId: string): Promise<PrHistory> {
    const pull = await this.repo.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const repoRow = await this.repos.findRepoById(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const repoRef: RepoRef = { owner: repoRow.owner, name: repoRow.name };

    const files = await this.repo.listFiles(prId);
    const byNumber = new Map<number, PrHistoryItem>();

    for (const file of files.slice(0, MAX_FILES)) {
      const commits = await this.source.listCommitsForPath(repoRef, file.path, MAX_COMMITS_PER_FILE);
      for (const commit of commits) {
        const prs = await this.source.listPullRequestsForCommit(repoRef, commit.sha);
        for (const pr of prs) {
          if (pr.merged_at == null) continue; // only merged PRs (E7)
          if (pr.number === pull.number) continue; // exclude the current PR (E7)

          const existing = byNumber.get(pr.number);
          if (existing) {
            if (!existing.files_overlap.includes(file.path)) existing.files_overlap.push(file.path);
          } else {
            byNumber.set(pr.number, {
              pr_number: pr.number,
              title: pr.title,
              merged_at: pr.merged_at,
              author: pr.author,
              files_overlap: [file.path],
              notes: '',
            });
          }
        }
      }
    }

    const history = [...byNumber.values()]
      .sort((a, b) => new Date(b.merged_at).getTime() - new Date(a.merged_at).getTime())
      .slice(0, MAX_RESULTS);

    return { history };
  }
}
