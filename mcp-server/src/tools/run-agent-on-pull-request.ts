import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestApi } from '../api/client.js';
import type { RunCache } from '../run-cache.js';
import type { Config } from '../config.js';
import { RunTimedOutError, waitForRun } from '../poll.js';
import { resolveAgent, resolvePull, resolveRepo } from '../resolve.js';
import { ReviewResult, toReviewResult } from '../present.js';
import {
  ToolError,
  runStatusError,
  runTimedOutError,
  toErrorResult,
} from '../errors.js';

/**
 * D10 — approved verbatim, do not paraphrase.
 */
export const RUN_AGENT_ON_PULL_REQUEST_DESCRIPTION = `Run one reviewer agent on a pull request and return the finished review in
a single call. Resolves \`repo\` (GitHub "owner/name") and \`pr\` (PR number)
to the pull already tracked in DevDigest, triggers \`agent\` (an id from
list_agents), and waits for the run to complete before returning verdict,
summary, score and findings. A real LLM review can take up to a few
minutes; if it doesn't finish before the timeout, the run keeps going in
the background — call get_findings with the returned run_id to pick up the
result later.`;

export interface RunAgentOnPullRequestDeps {
  api: DevDigestApi;
  cache: RunCache;
  config: Config;
}

/** Flat top-level args only (course principle 2) — never a nested object. */
export const runAgentOnPullRequestInputShape = {
  repo: z.string().min(1).describe('GitHub repo as "owner/name" (case-insensitive).'),
  pr: z.number().int().positive().describe('Pull request number, as shown on GitHub.'),
  agent: z.string().min(1).describe('An agent id from list_agents.'),
};

export function createRunAgentOnPullRequestTool(deps: RunAgentOnPullRequestDeps) {
  return {
    name: 'run_agent_on_pull_request',
    description: RUN_AGENT_ON_PULL_REQUEST_DESCRIPTION,
    inputSchema: runAgentOnPullRequestInputShape,
    outputSchema: ReviewResult.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args: {
      repo: string;
      pr: number;
      agent: string;
    }): Promise<CallToolResult> => {
      try {
        const repo = await resolveRepo(deps.api, args.repo);
        const pull = await resolvePull(deps.api, repo, args.pr);
        const agent = await resolveAgent(deps.api, args.agent);

        // Fire-and-forget backend (D9): the response returns before the run
        // finishes — see run() below, which does the polling.
        const triggered = await deps.api.triggerReview(pull.id!, agent.id);
        const target = triggered.runs[0];
        if (!target) {
          throw new ToolError(
            `DevDigest did not start a run for agent "${args.agent}" on PR #${args.pr}. Retry run_agent_on_pull_request.`,
          );
        }

        // Cache BEFORE polling so a timeout still leaves the run reachable
        // through get_findings (see run-cache.ts).
        deps.cache.set(target.run_id, pull.id!);

        const run = await waitForRun(deps.api, pull.id!, target.run_id, {
          pollIntervalMs: deps.config.pollIntervalMs,
          timeoutMs: deps.config.runTimeoutMs,
        });

        if (run.status !== 'done') {
          throw new ToolError(runStatusError(target.run_id, run.status, run.error));
        }

        const reviews = await deps.api.listReviews(pull.id!);
        const review = reviews.find((r) => r.run_id === target.run_id);
        if (!review) {
          throw new ToolError(
            `Run ${target.run_id} finished but its review was not found yet. Call get_findings with run_id "${target.run_id}" to retry.`,
          );
        }

        const result = toReviewResult(target.run_id, review);
        return {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (err) {
        if (err instanceof RunTimedOutError) {
          return toErrorResult(runTimedOutError(err.runId, err.timeoutMs));
        }
        return toErrorResult(
          err instanceof ToolError ? err.message : `Unexpected error: ${(err as Error).message}`,
        );
      }
    },
  };
}
