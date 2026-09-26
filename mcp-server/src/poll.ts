import type { DevDigestApi } from './api/client.js';
import type { RunSummary } from './vendor/shared/index.js';

/** Injectable clock/sleep so poll tests run on fake timers, never real ones. */
export interface PollClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export const systemClock: PollClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Thrown by `waitForRun` when the run is still `running` at the deadline. */
export class RunTimedOutError extends Error {
  constructor(
    public readonly runId: string,
    public readonly timeoutMs: number,
  ) {
    super(`Run ${runId} did not finish within ${timeoutMs}ms`);
    this.name = 'RunTimedOutError';
  }
}

export interface WaitForRunOptions {
  pollIntervalMs: number;
  timeoutMs: number;
  clock?: PollClock;
}

/**
 * `POST /pulls/:id/review` is fire-and-forget (D9/C-context): it returns
 * before the run finishes, so `run_agent_on_pull_request` polls
 * `GET /pulls/:id/runs` itself until the run's status leaves `'running'`, or
 * throws `RunTimedOutError` at the deadline. The run keeps going server-side
 * either way — a timeout here is a client-side give-up, not a cancellation.
 */
export async function waitForRun(
  api: DevDigestApi,
  pullId: string,
  runId: string,
  { pollIntervalMs, timeoutMs, clock = systemClock }: WaitForRunOptions,
): Promise<RunSummary> {
  const deadline = clock.now() + timeoutMs;
  for (;;) {
    const runs = await api.listRuns(pullId);
    const run = runs.find((r) => r.run_id === runId);
    if (run && run.status !== 'running') return run;

    if (clock.now() >= deadline) throw new RunTimedOutError(runId, timeoutMs);
    await clock.sleep(pollIntervalMs);
  }
}
