import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { FetchDevDigestApi } from './api/client.js';
import { RunCache } from './run-cache.js';
import { createServer } from './server.js';

/**
 * Composition root — the only place that constructs concrete instances.
 * stdout is the JSON-RPC channel, so nothing in this package ever
 * `console.log`s; `console.error` here is the one exception, for a fatal
 * startup failure the client can't otherwise see.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const api = new FetchDevDigestApi(config.apiUrl);
  const cache = new RunCache();
  const server = createServer({ api, cache, config });

  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  console.error('[mcp-server] fatal error during startup:', err);
  process.exit(1);
});
