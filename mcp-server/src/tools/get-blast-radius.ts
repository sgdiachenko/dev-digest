import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestApi } from '../api/client.js';
import { resolveRepo, resolvePull } from '../resolve.js';
import { GetBlastRadiusOutput } from '../present.js';
import { ToolError, toErrorResult } from '../errors.js';

/**
 * Rewritten for the real implementation (S7) — the old stub description
 * described `{ implemented: false, ... }`, which no longer exists.
 */
export const GET_BLAST_RADIUS_DESCRIPTION = `Show which symbols a pull request changes and what depends on them: for
each changed symbol, its known callers (file:line, from the repo's indexed
call graph) and the HTTP endpoints/cron jobs downstream of them. Identify
the pull request with repo (GitHub "owner/name") and pr (its number).
Returns a "degraded" flag and a "reason" when the repo's index is
incomplete or missing (the analysis is then best-effort, not an error) —
never fails for that reason. Errors only when the repo or PR itself is not
tracked in DevDigest.`;

export interface GetBlastRadiusDeps {
  api: DevDigestApi;
}

/** Flat top-level args only (course principle 2). */
export const getBlastRadiusInputShape = {
  repo: z.string().min(1).describe('GitHub repo as "owner/name" (case-insensitive).'),
  pr: z.number().int().positive().describe('Pull request number, as shown on GitHub.'),
};

export function createGetBlastRadiusTool(deps: GetBlastRadiusDeps) {
  return {
    name: 'get_blast_radius',
    description: GET_BLAST_RADIUS_DESCRIPTION,
    inputSchema: getBlastRadiusInputShape,
    outputSchema: GetBlastRadiusOutput.shape,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args: { repo: string; pr: number }): Promise<CallToolResult> => {
      try {
        const repo = await resolveRepo(deps.api, args.repo);
        const pull = await resolvePull(deps.api, repo, args.pr);
        const raw = await deps.api.getBlastRadius(pull.id!);
        const result = GetBlastRadiusOutput.parse(raw);
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
