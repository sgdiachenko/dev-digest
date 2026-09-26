import { describe, it, expect, vi } from 'vitest';
import { RunTimedOutError, waitForRun, type PollClock } from '../src/poll.js';
import { makeMockApi, makeRunSummary } from './fixtures.js';

/** A deterministic fake clock — `sleep` advances the clock instead of really
 *  waiting, so this test runs instantly and never touches real timers. */
function makeFakeClock(startAt = 0): PollClock {
  let time = startAt;
  return {
    now: () => time,
    sleep: vi.fn(async (ms: number) => {
      time += ms;
    }),
  };
}

describe('waitForRun', () => {
  it('re-polls until the run leaves `running`, then returns it', async () => {
    const api = makeMockApi();
    api.listRuns
      .mockResolvedValueOnce([makeRunSummary({ run_id: 'run-1', status: 'running' })])
      .mockResolvedValueOnce([makeRunSummary({ run_id: 'run-1', status: 'done' })]);
    const clock = makeFakeClock();

    const run = await waitForRun(api, 'pr-1', 'run-1', {
      pollIntervalMs: 1000,
      timeoutMs: 10_000,
      clock,
    });

    expect(run.status).toBe('done');
    expect(clock.sleep).toHaveBeenCalledTimes(1);
    expect(clock.sleep).toHaveBeenCalledWith(1000);
  });

  it('throws RunTimedOutError once the deadline passes while still running', async () => {
    const api = makeMockApi();
    api.listRuns.mockResolvedValue([makeRunSummary({ run_id: 'run-1', status: 'running' })]);
    const clock = makeFakeClock();

    await expect(
      waitForRun(api, 'pr-1', 'run-1', { pollIntervalMs: 1000, timeoutMs: 2500, clock }),
    ).rejects.toThrow(RunTimedOutError);
  });
});
