import { z } from 'zod';

/**
 * Single chokepoint for `process.env` in this package (mirrors the
 * `platform/config.ts` convention in `server/`). Nowhere else reads
 * `process.env` directly.
 */
const EnvSchema = z.object({
  DEVDIGEST_API_URL: z.string().url().default('http://localhost:3001'),
  DEVDIGEST_MCP_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  DEVDIGEST_MCP_RUN_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
});

export interface Config {
  /** Base URL of the DevDigest API (server/), no trailing slash. */
  apiUrl: string;
  /** How often waitForRun() re-polls `GET /pulls/:id/runs` while a run is in flight. */
  pollIntervalMs: number;
  /** How long run_agent_on_pull_request waits before returning a "still running" error. */
  runTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  return {
    apiUrl: parsed.DEVDIGEST_API_URL.replace(/\/+$/, ''),
    pollIntervalMs: parsed.DEVDIGEST_MCP_POLL_INTERVAL_MS,
    runTimeoutMs: parsed.DEVDIGEST_MCP_RUN_TIMEOUT_MS,
  };
}
