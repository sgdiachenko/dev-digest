import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * The one error type every tool handler throws. Its `message` is always
 * user-facing text that names the next concrete call or action (course
 * principle 4: "a error leads further") — never a raw stack trace or a bare
 * "something went wrong".
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Wrap an actionable message as an MCP tool error result (`isError: true`). */
export function toErrorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

// ---- Named message builders -------------------------------------------
// Each one names the next concrete step, per course principle 4.

export function repoNotFoundError(repo: string): string {
  return (
    `Repo "${repo}" is not tracked in this DevDigest workspace. Add it first ` +
    `(paste its URL in the DevDigest web UI, or POST /repos), then retry.`
  );
}

export function pullNotFoundError(repo: string, pr: number): string {
  return (
    `PR #${pr} was not found for repo "${repo}". Open the repo in the ` +
    `DevDigest web UI so its pull requests sync from GitHub, then retry.`
  );
}

export function agentNotFoundError(agent: string): string {
  return `Agent "${agent}" was not found. Call list_agents to get a valid agent id, then retry.`;
}

export function runUnknownError(runId: string): string {
  return (
    `run_id "${runId}" is not known in this MCP server session (it may belong ` +
    `to a different process, a restarted MCP server, or a run started from the ` +
    `web UI). Call run_agent_on_pull_request again to start a new run.`
  );
}

export function runStillRunningError(runId: string): string {
  return `Run ${runId} is still in progress. Call get_findings with run_id "${runId}" again in a few seconds.`;
}

export function runFailedError(runId: string, reason: string | null): string {
  return (
    `Run ${runId} failed${reason ? `: ${reason}` : ''}. Call ` +
    `run_agent_on_pull_request again to retry.`
  );
}

export function runCancelledError(runId: string): string {
  return `Run ${runId} was cancelled. Call run_agent_on_pull_request again to start a new run.`;
}

export function runTimedOutError(runId: string, timeoutMs: number): string {
  return (
    `Run ${runId} did not finish within ${Math.round(timeoutMs / 1000)}s; it is ` +
    `still running in the background. Call get_findings with run_id "${runId}" ` +
    `later to pick up the result.`
  );
}

export function apiUnavailableError(apiUrl: string): string {
  return `DevDigest API at ${apiUrl} is unreachable. Start it with ./scripts/dev.sh, then retry.`;
}

export function rateLimitError(): string {
  return `DevDigest API rate limit was hit. Wait a moment, then retry the same call.`;
}

/** Turn a non-`done` `RunSummary.status` into one actionable message. */
export function runStatusError(
  runId: string,
  status: string | null,
  error: string | null,
): string {
  switch (status) {
    case 'running':
      return runStillRunningError(runId);
    case 'failed':
      return runFailedError(runId, error);
    case 'cancelled':
      return runCancelledError(runId);
    default:
      return (
        `Run ${runId} has an unrecognized status (${String(status)}). Call ` +
        `run_agent_on_pull_request again to retry.`
      );
  }
}

export function unexpectedApiShapeError(path: string): string {
  return (
    `DevDigest API returned an unexpected response shape for ${path}. Check ` +
    `that the server and mcp-server versions match, then retry.`
  );
}
