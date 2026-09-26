import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestApi } from '../api/client.js';
import type { RunCache } from '../run-cache.js';
import { ReviewResult, toReviewResult } from '../present.js';
import { ToolError, runStatusError, runUnknownError, toErrorResult } from '../errors.js';

/**
 * D10 — approved verbatim, do not paraphrase.
 */
export const GET_FINDINGS_DESCRIPTION = `Fetch the result of a review run by its run_id (the id run_agent_on_pull_
request returns). Returns the same verdict/summary/findings shape once the
run has finished. If the run is still in progress, failed, or unrecognized
in this session, returns a message explaining what to do next instead of
the findings.`;

export interface GetFindingsDeps {
  api: DevDigestApi;
  cache: RunCache;
}

/** Flat top-level args only (course principle 2). */
export const getFindingsInputShape = {
  run_id: z.string().min(1).describe('The run_id returned by run_agent_on_pull_request.'),
};

export function createGetFindingsTool(deps: GetFindingsDeps) {
  return {
    name: 'get_findings',
    description: GET_FINDINGS_DESCRIPTION,
    inputSchema: getFindingsInputShape,
    outputSchema: ReviewResult.shape,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args: { run_id: string }): Promise<CallToolResult> => {
      try {
        const pullId = deps.cache.get(args.run_id);
        if (!pullId) throw new ToolError(runUnknownError(args.run_id));

        const runs = await deps.api.listRuns(pullId);
        const run = runs.find((r) => r.run_id === args.run_id);
        if (!run) throw new ToolError(runUnknownError(args.run_id));

        if (run.status !== 'done') {
          throw new ToolError(runStatusError(args.run_id, run.status, run.error));
        }

        const reviews = await deps.api.listReviews(pullId);
        const review = reviews.find((r) => r.run_id === args.run_id);
        if (!review) {
          throw new ToolError(
            `Run ${args.run_id} finished but its review was not found yet. Call get_findings with the same run_id again shortly.`,
          );
        }

        const result = toReviewResult(args.run_id, review);
        return {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (err) {
        return toErrorResult(
          err instanceof ToolError ? err.message : `Unexpected error: ${(err as Error).message}`,
        );
      }
    },
  };
}
