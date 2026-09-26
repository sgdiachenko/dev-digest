import { z } from 'zod';
import {
  Agent,
  ApiErrorBody,
  ConventionCandidate,
  Repo,
  PrMeta,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
} from '../vendor/shared/index.js';
import { ToolError, apiUnavailableError, rateLimitError, unexpectedApiShapeError } from '../errors.js';

/**
 * The one I/O module in this package. Every call goes through `request()`:
 * network failure, 429, and a malformed body all become an actionable
 * `ToolError` here, so tool handlers never see a raw `fetch` rejection.
 */
export interface DevDigestApi {
  listAgents(): Promise<Agent[]>;
  listRepos(): Promise<Repo[]>;
  listPullsForRepo(repoId: string): Promise<PrMeta[]>;
  triggerReview(pullId: string, agentId: string): Promise<ReviewRunResponse>;
  listRuns(pullId: string): Promise<RunSummary[]>;
  listReviews(pullId: string): Promise<ReviewRecord[]>;
  listConventions(repoId: string): Promise<ConventionCandidate[]>;
}

export class FetchDevDigestApi implements DevDigestApi {
  constructor(private readonly apiUrl: string) {}

  listAgents(): Promise<Agent[]> {
    return this.request('/agents', z.array(Agent));
  }

  listRepos(): Promise<Repo[]> {
    return this.request('/repos', z.array(Repo));
  }

  listPullsForRepo(repoId: string): Promise<PrMeta[]> {
    return this.request(`/repos/${encodeURIComponent(repoId)}/pulls`, z.array(PrMeta));
  }

  triggerReview(pullId: string, agentId: string): Promise<ReviewRunResponse> {
    return this.request(`/pulls/${encodeURIComponent(pullId)}/review`, ReviewRunResponse, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
  }

  listRuns(pullId: string): Promise<RunSummary[]> {
    return this.request(`/pulls/${encodeURIComponent(pullId)}/runs`, z.array(RunSummary));
  }

  listReviews(pullId: string): Promise<ReviewRecord[]> {
    return this.request(`/pulls/${encodeURIComponent(pullId)}/reviews`, z.array(ReviewRecord));
  }

  listConventions(repoId: string): Promise<ConventionCandidate[]> {
    return this.request(
      `/repos/${encodeURIComponent(repoId)}/conventions`,
      z.array(ConventionCandidate),
    );
  }

  private async request<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    init?: RequestInit,
  ): Promise<z.infer<S>> {
    let res: Response;
    try {
      res = await fetch(`${this.apiUrl}${path}`, init);
    } catch {
      throw new ToolError(apiUnavailableError(this.apiUrl));
    }

    if (res.status === 429) {
      throw new ToolError(rateLimitError());
    }

    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const parsedError = ApiErrorBody.safeParse(body);
      const message = parsedError.success
        ? parsedError.data.error.message
        : `DevDigest API returned ${res.status} for ${path}`;
      throw new ToolError(`DevDigest API error (${res.status}): ${message}`);
    }

    const body: unknown = await res.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ToolError(unexpectedApiShapeError(path));
    }
    return parsed.data;
  }
}
