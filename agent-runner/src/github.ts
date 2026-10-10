import type { GitHubReviewPayload } from '@devdigest/shared';
import { DiffUnavailableError, RunnerError } from './errors.js';
import type { PrContext } from './context.js';

/**
 * Thin GitHub REST client on the global `fetch` (no octokit: the bundle stays
 * dependency-free). `fetchImpl` is injectable so tests never touch the network.
 * No call is retried except the one documented 422 body-only post (AC-164).
 */

export type FetchLike = typeof fetch;
type Target = Pick<PrContext, 'owner' | 'repo' | 'prNumber'>;

const GITHUB_API_BASE = 'https://api.github.com';
/** Upper bound for one diff request, headers and body together. */
const DIFF_FETCH_TIMEOUT_MS = 60_000;
const API_VERSION = '2022-11-28';
const USER_AGENT = 'devdigest-agent-runner';

function authHeaders(token: string, accept: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': USER_AGENT,
  };
}

/** Read a response body as text, refusing to buffer more than `maxBytes`. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new DiffUnavailableError(`diff is larger than ${maxBytes} bytes`);
  }
  if (!res.body) {
    const text = await res.text();
    if (Buffer.byteLength(text) > maxBytes) throw new DiffUnavailableError(`diff is larger than ${maxBytes} bytes`);
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let step: Awaited<ReturnType<typeof reader.read>>;
    try {
      step = await reader.read();
    } catch (err) {
      // A stalled or aborted body (the request timeout) must not hang the run.
      throw new DiffUnavailableError(`diff body read failed: ${(err as Error).message}`);
    }
    const { done, value } = step;
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new DiffUnavailableError(`diff is larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetch the unified diff between the EVENT's base and head commits (AC-56,
 * EC-47); without both SHAs, the PR's current diff. Any failure, non-2xx or an
 * over-cap body is `DiffUnavailableError` (AC-156, AC-157).
 */
export async function fetchPrDiff(
  ctx: Pick<PrContext, 'owner' | 'repo' | 'prNumber' | 'baseSha' | 'headSha'>,
  token: string,
  maxBytes: number,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const repoUrl = `${GITHUB_API_BASE}/repos/${ctx.owner}/${ctx.repo}`;
  const url =
    ctx.baseSha && ctx.headSha
      ? `${repoUrl}/compare/${ctx.baseSha}...${ctx.headSha}`
      : `${repoUrl}/pulls/${ctx.prNumber}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: authHeaders(token, 'application/vnd.github.v3.diff'),
      // Bounds headers and body reads; a stalled GitHub response fails the agent instead of the job.
      signal: AbortSignal.timeout(DIFF_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new DiffUnavailableError(`diff request failed: ${(err as Error).message}`);
  }
  if (!res.ok) throw new DiffUnavailableError(`diff request returned ${res.status}`);
  try {
    return await readCapped(res, maxBytes);
  } catch (err) {
    if (err instanceof DiffUnavailableError) throw err;
    throw new DiffUnavailableError(`diff body could not be read: ${(err as Error).message}`);
  }
}

/** Post a full review — `post_as: 'github_review'`. */
export async function postGithubReview(
  ctx: Target,
  token: string,
  payload: GitHubReviewPayload,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const url = `${GITHUB_API_BASE}/repos/${ctx.owner}/${ctx.repo}/pulls/${ctx.prNumber}/reviews`;
  const post = (body: Record<string, unknown>) =>
    fetchImpl(url, {
      method: 'POST',
      headers: { ...authHeaders(token, 'application/vnd.github+json'), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  // GITHUB_TOKEN may not APPROVE a PR (422): an APPROVE becomes a COMMENT; the
  // body still carries the "Approved" summary. REQUEST_CHANGES and COMMENT stay.
  const event = payload.event === 'APPROVE' ? 'COMMENT' : payload.event;
  const base = { body: payload.body, event };
  const hasComments = !!payload.comments && payload.comments.length > 0;
  const withComments = hasComments
    ? { ...base, comments: payload.comments!.map((c) => ({ path: c.path, line: c.line, body: c.body })) }
    : base;

  let res = await post(withComments);
  // One bad inline anchor makes GitHub reject the WHOLE review with 422: retry
  // once with the same event and body and no inline comments (AC-164).
  if (res.status === 422 && hasComments) res = await post(base);
  if (!res.ok) throw new RunnerError(`GitHub API error posting review: ${res.status}`);
}

/** Post a plain issue comment — `post_as: 'pr_comment'`. */
export async function postPrComment(
  ctx: Target,
  token: string,
  body: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const url = `${GITHUB_API_BASE}/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.prNumber}/comments`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { ...authHeaders(token, 'application/vnd.github+json'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new RunnerError(`GitHub API error posting PR comment: ${res.status}`);
}
