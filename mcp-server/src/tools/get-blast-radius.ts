import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { GetBlastRadiusOutput } from '../present.js';

/**
 * D10 — approved verbatim, do not paraphrase.
 */
export const GET_BLAST_RADIUS_DESCRIPTION = `Not implemented yet: a future analysis of which files and symbols a pull
request's changes affect downstream. Always returns
{ implemented: false, message, affected_files: [] } regardless of input,
and never fails — treat implemented: false as "not available yet", not as
an error.`;

/** Flat top-level args only (course principle 2) — unused today, kept flat
 *  for when the real implementation (a later lesson) needs them. */
export const getBlastRadiusInputShape = {
  repo: z.string().min(1).describe('GitHub repo as "owner/name".'),
  pr: z.number().int().positive().describe('Pull request number, as shown on GitHub.'),
};

/**
 * D4: a soft stub, on purpose — no API call, never `isError`, always this
 * exact shape. The real analysis (reading `repo-intel`'s dependency graph) is
 * a later course lesson's homework.
 */
export function createGetBlastRadiusTool() {
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
    handler: async (): Promise<CallToolResult> => {
      const result = GetBlastRadiusOutput.parse({
        implemented: false,
        message: 'Blast radius analysis is not implemented yet.',
        affected_files: [],
      });
      return {
        structuredContent: result,
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    },
  };
}
