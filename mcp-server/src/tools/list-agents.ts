import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestApi } from '../api/client.js';
import { ToolError, toErrorResult } from '../errors.js';
import { ListAgentsOutput, toAgentCompact } from '../present.js';

/**
 * D10 — approved verbatim, do not paraphrase.
 */
export const LIST_AGENTS_DESCRIPTION = `List the reviewer agents configured in this DevDigest workspace. Returns
each agent's id, name, description, provider and model. Call this first to
get a valid \`agent\` id before calling run_agent_on_pull_request.`;

export interface ListAgentsDeps {
  api: DevDigestApi;
}

/** No arguments — the agent list is workspace-scoped, not per-repo. */
export const listAgentsInputShape = {};

export function createListAgentsTool(deps: ListAgentsDeps) {
  return {
    name: 'list_agents',
    description: LIST_AGENTS_DESCRIPTION,
    inputSchema: listAgentsInputShape,
    outputSchema: ListAgentsOutput.shape,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (): Promise<CallToolResult> => {
      try {
        const agents = await deps.api.listAgents();
        const result = ListAgentsOutput.parse({ agents: agents.map(toAgentCompact) });
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
