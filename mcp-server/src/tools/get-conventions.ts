import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestApi } from '../api/client.js';
import { resolveRepo } from '../resolve.js';
import { GetConventionsOutput, toConventionCompacts } from '../present.js';
import { ToolError, toErrorResult } from '../errors.js';

/**
 * D10 — approved verbatim, do not paraphrase.
 */
export const GET_CONVENTIONS_DESCRIPTION = `List the accepted coding conventions DevDigest has extracted for a
repository, identified by repo (GitHub "owner/name"). Each item has a
rule, its rationale and a category — the same accepted house rules
injected into this repo's review prompts. Pending or rejected candidates
are not included.`;

export interface GetConventionsDeps {
  api: DevDigestApi;
}

/** Flat top-level args only (course principle 2). */
export const getConventionsInputShape = {
  repo: z.string().min(1).describe('GitHub repo as "owner/name" (case-insensitive).'),
};

export function createGetConventionsTool(deps: GetConventionsDeps) {
  return {
    name: 'get_conventions',
    description: GET_CONVENTIONS_DESCRIPTION,
    inputSchema: getConventionsInputShape,
    outputSchema: GetConventionsOutput.shape,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args: { repo: string }): Promise<CallToolResult> => {
      try {
        const repo = await resolveRepo(deps.api, args.repo);
        const candidates = await deps.api.listConventions(repo.id);
        const result = GetConventionsOutput.parse({
          conventions: toConventionCompacts(candidates),
        });
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
