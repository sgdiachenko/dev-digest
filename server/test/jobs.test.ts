import { describe, it, expect, vi, afterEach } from 'vitest';
import { JobRunner } from '../src/platform/jobs.js';
import type { Db } from '../src/db/client.js';

/** Minimal drizzle stand-in: records every `.update().set(patch)` and returns a job id on insert. */
function fakeDb() {
  const patches: Array<Record<string, unknown>> = [];
  const db = {
    insert: () => ({ values: () => ({ returning: async () => [{ id: 'job-1' }] }) }),
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        patches.push(patch);
        return { where: async () => undefined };
      },
    }),
  } as unknown as Db;
  return { db, patches };
}

const unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);

afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
  unhandled.length = 0;
});

describe('JobRunner failure handling', () => {
  it('marks the row failed, lets awaiters see the rejection, and raises no unhandled rejection for fire-and-forget callers', async () => {
    process.on('unhandledRejection', onUnhandled);
    const { db, patches } = fakeDb();
    const runner = new JobRunner(db, { retries: 0, timeoutMs: 1000 });
    runner.register('boom', vi.fn(async () => { throw new Error('kaboom'); }));

    const job = await runner.enqueue('ws', 'boom', {}); // fire-and-forget: `done` is never awaited
    await runner.onIdle();
    // give the event loop a turn so a stray rejection would be reported
    await new Promise((r) => setImmediate(r));

    expect(unhandled).toEqual([]);
    expect(patches.at(-1)).toMatchObject({ status: 'failed', error: 'kaboom' });
    await expect(job.done).rejects.toThrow('kaboom');
  });
});
