import { Octokit } from 'octokit';
import type {
  GitHubClient,
  RepoRef,
  PrMeta,
  PrDetail,
  PrStatus,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  IssueMeta,
  GitHubCiClient,
  CiWorkflowRun,
  CiRunArtifact,
} from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { AppError } from '../../platform/errors.js';

const TIMEOUT = 30_000;

function mapStatus(state: string, merged: boolean | undefined): PrStatus {
  if (merged) return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

/**
 * GitHubClient over Octokit REST — thin. PAT auth (fine-grained).
 * Reads PR list/detail/files/commits/issue; posts reviews; opens PRs.
 */
export class OctokitGitHubClient implements GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          // Fetch open + recently merged/closed (most-recently-updated first) so
          // the list shows which PRs are merged vs still open — not just open.
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            per_page: 50,
          });
          return res.data.map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: 0,
            deletions: 0,
            files_count: 0, // not present on the list payload; populated by getPullRequest
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
          }));
        })(),
        TIMEOUT,
      ),
    );
  }

  async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const { data: pr } = await this.octokit.rest.pulls.get({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
          });
          const { data: files } = await this.octokit.rest.pulls.listFiles({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const { data: commits } = await this.octokit.rest.pulls.listCommits({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const linkedIssue = await this.resolveLinkedIssue(repo, pr.body ?? '');
          return {
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: pr.additions,
            deletions: pr.deletions,
            files_count: pr.changed_files,
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
            body: pr.body,
            files: files.map((f) => ({
              path: f.filename,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch,
            })),
            commits: commits.map((c) => ({
              sha: c.sha,
              message: c.commit.message,
              author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
              committed_at: c.commit.author?.date,
            })),
            linked_issue: linkedIssue,
          };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** linked issue via regex on PR body (#123 / closes #123). */
  private async resolveLinkedIssue(repo: RepoRef, body: string): Promise<IssueMeta | undefined> {
    const m = body.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
    if (!m?.[1]) return undefined;
    try {
      return await this.getIssue(repo, Number(m[1]));
    } catch {
      return undefined;
    }
  }

  async postReview(
    repo: RepoRef,
    n: number,
    review: GitHubReviewPayload,
  ): Promise<{ id: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.createReview({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            body: review.body,
            event: review.event,
            comments: review.comments?.map((c) => ({
              path: c.path,
              line: c.line,
              body: c.body,
            })),
          });
          return { id: String(res.data.id) };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** Shape an Octokit review-comment payload into our DTO. */
  private mapReviewComment(c: {
    id: number;
    path: string;
    line?: number | null;
    original_line?: number | null;
    side?: string | null;
    body: string;
    user: { login: string } | null;
    created_at: string;
    html_url: string;
    in_reply_to_id?: number;
  }): PrReviewComment {
    return {
      id: c.id,
      path: c.path,
      line: c.line ?? null,
      original_line: c.original_line ?? null,
      side: c.side === 'LEFT' ? 'LEFT' : 'RIGHT',
      body: c.body,
      user: c.user?.login ?? 'unknown',
      created_at: c.created_at,
      html_url: c.html_url,
      in_reply_to_id: c.in_reply_to_id ?? null,
      // GitHub drops `line` when the comment can no longer be placed on the diff.
      is_outdated: c.line == null,
    };
  }

  async listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.listReviewComments({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          return res.data.map((c) => this.mapReviewComment(c));
        })(),
        TIMEOUT,
      ),
    );
  }

  async createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          if (input.inReplyTo != null) {
            const res = await this.octokit.rest.pulls.createReplyForReviewComment({
              owner: repo.owner,
              repo: repo.name,
              pull_number: n,
              comment_id: input.inReplyTo,
              body: input.body,
            });
            return this.mapReviewComment(res.data);
          }
          const res = await this.octokit.rest.pulls.createReviewComment({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            commit_id: input.commitId,
            path: input.path,
            line: input.line,
            side: input.side ?? 'RIGHT',
            body: input.body,
          });
          return this.mapReviewComment(res.data);
        })(),
        TIMEOUT,
      ),
    );
  }

  async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    return withTimeout(
      (async () => {
        const res = await this.octokit.rest.pulls.create({
          owner: repo.owner,
          repo: repo.name,
          title: payload.title,
          head: payload.head,
          base: payload.base,
          body: payload.body,
        });
        return { url: res.data.html_url };
      })(),
      TIMEOUT,
    );
  }

  async commitFiles(
    repo: RepoRef,
    payload: CommitFilesPayload,
  ): Promise<{ branch: string }> {
    return withTimeout(
      (async () => {
        const owner = repo.owner;
        const name = repo.name;
        const g = this.octokit.rest.git;

        // Parent commit: the target branch if it already exists, else the base.
        let parentSha: string;
        let branchExists = false;
        try {
          const ref = await g.getRef({ owner, repo: name, ref: `heads/${payload.branch}` });
          parentSha = ref.data.object.sha;
          branchExists = true;
        } catch {
          const baseRef = await g.getRef({ owner, repo: name, ref: `heads/${payload.base}` });
          parentSha = baseRef.data.object.sha;
        }

        // New tree layered on the parent's tree (so unrelated files are kept).
        const parentCommit = await g.getCommit({ owner, repo: name, commit_sha: parentSha });
        const tree = await g.createTree({
          owner,
          repo: name,
          base_tree: parentCommit.data.tree.sha,
          tree: [
            ...payload.files.map((f) => ({
              path: f.path,
              mode: '100644' as const,
              type: 'blob' as const,
              content: f.contents,
            })),
            // A null sha removes the path from the layered tree.
            ...(payload.deletes ?? []).map((path) => ({
              path,
              mode: '100644' as const,
              type: 'blob' as const,
              sha: null,
            })),
          ],
        });

        const commit = await g.createCommit({
          owner,
          repo: name,
          message: payload.message,
          tree: tree.data.sha,
          parents: [parentSha],
        });

        if (branchExists) {
          await g.updateRef({
            owner,
            repo: name,
            ref: `heads/${payload.branch}`,
            sha: commit.data.sha,
            force: true,
          });
        } else {
          await g.createRef({
            owner,
            repo: name,
            ref: `refs/heads/${payload.branch}`,
            sha: commit.data.sha,
          });
        }
        return { branch: payload.branch };
      })(),
      TIMEOUT,
    );
  }

  async findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null> {
    return withTimeout(
      (async () => {
        const res = await this.octokit.rest.pulls.list({
          owner: repo.owner,
          repo: repo.name,
          state: 'open',
          head: `${repo.owner}:${branch}`,
          per_page: 1,
        });
        const pr = res.data[0];
        return pr ? { url: pr.html_url } : null;
      })(),
      TIMEOUT,
    );
  }

  async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.issues.get({ owner: repo.owner, repo: repo.name, issue_number: n }),
        TIMEOUT,
      ),
    );
    return {
      number: res.data.number,
      title: res.data.title,
      body: res.data.body,
      state: res.data.state,
    };
  }

  async currentLogin(): Promise<string> {
    const res = await withRetry(() =>
      withTimeout(this.octokit.rest.users.getAuthenticated(), TIMEOUT),
    );
    return res.data.login;
  }

  async listCommitsForPath(repo: RepoRef, path: string, perPage: number): Promise<{ sha: string }[]> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.repos.listCommits({
          owner: repo.owner,
          repo: repo.name,
          path,
          per_page: perPage,
        }),
        TIMEOUT,
      ),
    );
    return res.data.map((c) => ({ sha: c.sha }));
  }

  async listPullRequestsForCommit(
    repo: RepoRef,
    sha: string,
  ): Promise<{ number: number; title: string; merged_at: string | null; author: string }[]> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
          owner: repo.owner,
          repo: repo.name,
          commit_sha: sha,
        }),
        TIMEOUT,
      ),
    );
    return res.data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      merged_at: pr.merged_at,
      author: pr.user?.login ?? 'unknown',
    }));
  }
}

/**
 * GitHubCiClient over Octokit REST — the read side of Export to CI. Thin, one
 * request per call, NO retries (NFR-5): failures surface with their HTTP
 * `status` and the service maps them to stable error codes.
 */
export class OctokitGitHubCiClient implements GitHubCiClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async getRepo(repo: RepoRef): Promise<{ id: number; defaultBranch: string }> {
    const res = await withTimeout(
      this.octokit.rest.repos.get({ owner: repo.owner, repo: repo.name }),
      TIMEOUT,
    );
    return { id: res.data.id, defaultBranch: res.data.default_branch };
  }

  async branchExists(repo: RepoRef, branch: string): Promise<boolean> {
    try {
      await withTimeout(
        this.octokit.rest.git.getRef({
          owner: repo.owner,
          repo: repo.name,
          ref: `heads/${branch}`,
        }),
        TIMEOUT,
      );
      return true;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return false;
      throw err;
    }
  }

  async readBranchFiles(
    repo: RepoRef,
    branch: string,
    paths: string[],
  ): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = Object.fromEntries(paths.map((p) => [p, null]));
    const g = this.octokit.rest.git;
    const ref = await withTimeout(
      g.getRef({ owner: repo.owner, repo: repo.name, ref: `heads/${branch}` }),
      TIMEOUT,
    );
    const commit = await withTimeout(
      g.getCommit({ owner: repo.owner, repo: repo.name, commit_sha: ref.data.object.sha }),
      TIMEOUT,
    );
    const tree = await withTimeout(
      g.getTree({
        owner: repo.owner,
        repo: repo.name,
        tree_sha: commit.data.tree.sha,
        recursive: 'true',
      }),
      TIMEOUT,
    );
    // A truncated tree may omit a wanted path: it then reads as absent, which
    // only costs an extra (identical) commit — never a skipped one.
    for (const entry of tree.data.tree) {
      if (entry.type === 'blob' && entry.path && entry.path in out && entry.sha) {
        out[entry.path] = entry.sha;
      }
    }
    return out;
  }

  async listWorkflowRuns(
    repo: RepoRef,
    workflowFile: string,
    perPage: number,
  ): Promise<CiWorkflowRun[]> {
    const res = await withTimeout(
      this.octokit.rest.actions.listWorkflowRuns({
        owner: repo.owner,
        repo: repo.name,
        workflow_id: workflowFile,
        per_page: perPage,
      }),
      TIMEOUT,
    );
    return res.data.workflow_runs.map((r) => ({
      id: r.id,
      runAttempt: typeof r.run_attempt === 'number' ? r.run_attempt : null,
      headSha: r.head_sha,
      headRepo: r.head_repository?.full_name ?? null,
      repositoryId: r.repository.id,
      path: r.path,
      status: r.status ?? null,
      conclusion: r.conclusion ?? null,
      htmlUrl: r.html_url,
      runStartedAt: r.run_started_at ?? null,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      pullRequests: (r.pull_requests ?? []).map((p) => p.number),
    }));
  }

  async listRunArtifacts(repo: RepoRef, runId: number): Promise<CiRunArtifact[]> {
    const res = await withTimeout(
      this.octokit.rest.actions.listWorkflowRunArtifacts({
        owner: repo.owner,
        repo: repo.name,
        run_id: runId,
        per_page: 100,
      }),
      TIMEOUT,
    );
    return res.data.artifacts.map((a) => ({
      id: a.id,
      name: a.name,
      expired: a.expired,
      sizeInBytes: a.size_in_bytes,
    }));
  }

  async downloadArtifact(
    repo: RepoRef,
    artifactId: number,
    maxBytes: number,
  ): Promise<Uint8Array | null> {
    // The redirect URL is short-lived and pre-signed: it lives only in this
    // function's locals, is fetched at once, and no error built here carries it.
    let location: string | undefined;
    try {
      const res = await withTimeout(
        this.octokit.request('GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}', {
          owner: repo.owner,
          repo: repo.name,
          artifact_id: artifactId,
          archive_format: 'zip',
          request: { redirect: 'manual' },
        }),
        TIMEOUT,
      );
      location = (res.headers as Record<string, string | undefined>).location;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 410) return null;
      throw err;
    }
    if (!location) {
      throw new AppError('github_unavailable', 'GitHub returned no artifact download location', 503);
    }
    try {
      const resp = await withTimeout(fetch(location), TIMEOUT);
      if (resp.status === 410 || resp.status === 404) return null;
      if (!resp.ok || !resp.body) {
        throw new AppError('github_unavailable', 'GitHub artifact download failed', 503);
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = resp.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new AppError('artifact_too_large', 'The artifact archive exceeds the size cap', 413);
        }
        chunks.push(value);
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
      }
      return out;
    } catch (err) {
      if (err instanceof AppError) throw err;
      // fetch errors can embed the URL — replace them with a fixed message.
      throw new AppError('github_unavailable', 'GitHub artifact download failed', 503);
    }
  }

  async findPrByHead(
    repo: RepoRef,
    headSha: string,
    headRepo: string | null,
  ): Promise<number | null> {
    if (!headRepo) return null;
    const res = await withTimeout(
      this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        owner: repo.owner,
        repo: repo.name,
        commit_sha: headSha,
        per_page: 30,
      }),
      TIMEOUT,
    );
    const match = res.data.find((pr) => pr.head.sha === headSha && pr.head.repo?.full_name === headRepo);
    return match ? match.number : null;
  }
}
