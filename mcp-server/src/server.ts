import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from './api/client.js';
import type { RunCache } from './run-cache.js';
import type { Config } from './config.js';
import { createListAgentsTool } from './tools/list-agents.js';
import { createRunAgentOnPullRequestTool } from './tools/run-agent-on-pull-request.js';
import { createGetFindingsTool } from './tools/get-findings.js';
import { createGetConventionsTool } from './tools/get-conventions.js';
import { createGetBlastRadiusTool } from './tools/get-blast-radius.js';

export interface ServerDeps {
  api: DevDigestApi;
  cache: RunCache;
  config: Config;
}

/** The 5 tool definitions, wired to `deps`. Exported separately from
 *  `createServer` so tests can assert on shape (flat inputSchema,
 *  outputSchema, annotations, description length) without an MCP transport. */
export function createToolDefinitions(deps: ServerDeps) {
  return [
    createListAgentsTool({ api: deps.api }),
    createRunAgentOnPullRequestTool(deps),
    createGetFindingsTool({ api: deps.api, cache: deps.cache }),
    createGetConventionsTool({ api: deps.api }),
    createGetBlastRadiusTool({ api: deps.api }),
  ];
}

/**
 * Registers the 5 tools on a fresh `McpServer`. The only place that wires
 * concrete deps into tool factories — `src/index.ts` is the only caller.
 */
export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'devdigest-mcp', version: '0.0.0' });

  const tools = createToolDefinitions(deps);

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
      },
      tool.handler,
    );
  }

  return server;
}
