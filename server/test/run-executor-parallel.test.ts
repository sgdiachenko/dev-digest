import { describe, it, expect } from 'vitest';
import { MockGitClient } from '../src/adapters/mocks.js';
import { RunBus } from '../src/platform/sse.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import type { Logger } from '../src/modules/reviews/run-executor.js';
import type { ReviewRepository, PullRow } from '../src/modules/reviews/repository.js';
import type { AgentRow } from '../src/db/rows.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

/**
 * Parallel (multi-agent group) mode of `executeRuns`, driven with fakes for every port.
 * A barrier inside the fake LLM only opens once ALL members are inside their call, so the
 * sequential default can never pass it (it times out), which proves parallelism.
 */

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "x",
   redisUrl: x,`;

const DIFF_TWO = `${DIFF}
diff --git a/docs/a.md b/docs/a.md
--- a/docs/a.md
+++ b/docs/a.md
@@ -1,2 +1,3 @@
 # A
+changed
 end`;

const PULL = { id: 'pr-1', repoId: 'repo-1', number: 7, title: 'T', body: null, base: 'main', headSha: 'abc' } as unknown as PullRow;
const REPO = { owner: 'acme', name: 'api' } as never;

const agent = (name: string, strategy = 'single-pass'): AgentRow =>
  ({
    id: `agent-${name}`,
    name,
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: `SYS-${name}`,
    strategy,
    ciFailOn: 'critical',
    repoIntel: false,
    version: 1,
  }) as unknown as AgentRow;

const reviewFor = (name: string) => ({
  verdict: 'comment',
  summary: 'ok',
  score: 90,
  findings: [
    {
      id: `v-${name}`, severity: 'WARNING', category: 'bug', title: `Valid by ${name}`, file: 'src/config.ts',
      start_line: 11, end_line: 11, rationale: 'r', confidence: 0.9, kind: 'finding',
    },
    {
      id: `h-${name}`, severity: 'WARNING', category: 'bug', title: `Phantom by ${name}`, file: 'src/config.ts',
      start_line: 999, end_line: 999, rationale: 'r', confidence: 0.9, kind: 'finding',
    },
  ],
});

type Saved = Record<string, any>;

async function run(opts: {
  parallel: boolean;
  names?: string[];
  barrier?: boolean;
  failName?: string;
  cancelName?: string;
  diffThrows?: boolean;
}) {
  const names = opts.names ?? ['A', 'B', 'C'];
  const bus = new RunBus();
  const jobs = names.map((n) => ({ agent: agent(n, n === opts.cancelName ? 'map-reduce' : 'single-pass'), runId: `run-${n}` }));
  const saved = new Map<string, Saved>();
  const completed = new Map<string, any>();
  const repo = {
    completeAgentRun: async (id: string, r: unknown) => void completed.set(id, r),
    saveRunTrace: async (id: string, t: Saved) => void saved.set(id, t),
    insertReviewWithFindings: async () => ({ review: { id: 'rev-1' }, findings: [] }),
    markReviewed: async () => undefined,
    getPrFiles: async () => {
      if (opts.diffThrows) throw new Error('boom');
      return [];
    },
  } as unknown as ReviewRepository;

  let started = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const llm = {
    id: 'openai',
    async completeStructured(req: any) {
      calls++;
      const name = names.find((n) => String(req.messages[0].content).includes(`SYS-${n}`))!;
      started++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        if (opts.barrier) {
          if (started === names.length) release();
          await Promise.race([
            gate,
            new Promise((_, rej) => setTimeout(() => rej(new Error('barrier timeout')), 300)),
          ]);
        } else {
          await new Promise((r) => setTimeout(r, 5));
        }
        if (name === opts.failName) throw new Error('LLM exploded');
        if (name === opts.cancelName) bus.cancel(`run-${name}`);
        const fixture = reviewFor(name);
        return { data: req.schema.parse(fixture), model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0.001, raw: '{}', attempts: 1 };
      } finally {
        inFlight--;
      }
    },
  };

  let diffCalls = 0;
  const git = new MockGitClient({ diff: opts.cancelName ? DIFF_TWO : DIFF });
  git.diff = (async () => {
    diffCalls++;
    if (opts.diffThrows) throw new Error('boom');
    return new MockGitClient({ diff: opts.cancelName ? DIFF_TWO : DIFF }).diff();
  }) as typeof git.diff;
  let intentCalls = 0;
  const logs: { obj: any; msg?: string }[] = [];
  const rec = (obj: unknown, msg?: string) => void logs.push({ obj, msg });
  const logger: Logger = { info: rec, warn: rec, error: rec, debug: rec };

  const executor = new ReviewRunExecutor(
    repo, bus, async () => llm as never, {} as RepoIntel, git,
    { forAgent: async () => [] },
    { deriveForReview: async () => { intentCalls++; return Promise.reject(new Error('no intent')); } },
    { resolveForRun: async () => ({ kind: 'none' as const }) },
  );
  const p = executor.executeRuns('ws-1', PULL, REPO, jobs, logger, opts.parallel ? { parallel: true, groupId: 'grp-1' } : undefined);
  await p;
  return { bus, saved, completed, calls, diffCalls, intentCalls, maxInFlight, logs };
}

describe('executeRuns parallel mode', () => {
  it('starts all LLM calls before any resolves; diff and intent once; 3 calls (AC-8, NFR-3)', async () => {
    const r = await run({ parallel: true, barrier: true });
    expect([...r.completed.values()].map((c) => c.status)).toEqual(['done', 'done', 'done']);
    expect(r.maxInFlight).toBe(3);
    expect(r.calls).toBe(3);
    expect(r.diffCalls).toBe(1);
    expect(r.intentCalls).toBe(1);
  });

  it('the sequential default never has two calls in flight (AC-7) and cannot pass the barrier', async () => {
    const seq = await run({ parallel: false });
    expect(seq.maxInFlight).toBe(1);
    const blocked = await run({ parallel: false, barrier: true });
    expect(blocked.maxInFlight).toBe(1);
    expect(blocked.completed.get('run-A')).toMatchObject({ status: 'failed' });
    expect(blocked.completed.get('run-A').error).toContain('barrier timeout');
  });

  it('isolates a failing member (AC-9, EC-3)', async () => {
    const r = await run({ parallel: true, failName: 'B' });
    expect(r.completed.get('run-B')).toMatchObject({ status: 'failed' });
    expect(r.completed.get('run-B').error).toContain('LLM exploded');
    expect(r.completed.get('run-A').status).toBe('done');
    expect(r.completed.get('run-C').status).toBe('done');
  });

  it('does not automatically retry a failed member: one LLM call per member (NFR-6)', async () => {
    const r = await run({ parallel: true, failName: 'B' });
    expect(r.calls).toBe(3);
    expect(r.completed.get('run-B')).toMatchObject({ status: 'failed' });
  });

  it('cancelling one member leaves the others done (EC-11)', async () => {
    const r = await run({ parallel: true, cancelName: 'B' });
    expect(r.completed.get('run-B').status).toBe('cancelled');
    expect(r.completed.get('run-A').status).toBe('done');
    expect(r.completed.get('run-C').status).toBe('done');
  });

  it('a throwing diff load fails every run (AC-10)', async () => {
    const r = await run({ parallel: true, diffThrows: true });
    expect(r.calls).toBe(0);
    for (const n of ['A', 'B', 'C']) {
      expect(r.completed.get(`run-${n}`)).toMatchObject({ status: 'failed', error: 'Failed to load PR diff: boom' });
    }
  });

  it('each saved trace holds only its own start line plus shared lines, and its own grounding (AC-11, AC-72, AC-73, NFR-5)', async () => {
    const r = await run({ parallel: true, barrier: true });
    for (const n of ['A', 'B', 'C']) {
      const log: string[] = r.saved.get(`run-${n}`)!.log.map((l: any) => l.msg);
      const starts = log.filter((m) => m.startsWith('Starting review with agent'));
      expect(starts).toEqual([`Starting review with agent "${n}" (openai/gpt-4.1)`]);
      expect(log.some((m) => m.includes('Diff ready'))).toBe(true);
      expect(log.filter((m) => m.startsWith('grounding dropped'))).toEqual([
        expect.stringContaining(`"Phantom by ${n}"`),
      ]);
      expect(r.saved.get(`run-${n}`)!.stats.grounding).toBe('1/2 passed');
    }
  });

  it('logs exactly one group line with ids and statuses, no diff text (NFR-9)', async () => {
    const r = await run({ parallel: true, failName: 'B' });
    const group = r.logs.filter((l) => l.msg === 'review: group finished');
    expect(group).toHaveLength(1);
    expect(group[0]!.obj).toEqual({
      multiAgentRunId: 'grp-1',
      runs: [
        { runId: 'run-A', status: 'done' },
        { runId: 'run-B', status: 'failed' },
        { runId: 'run-C', status: 'done' },
      ],
    });
    expect(JSON.stringify(group[0]!.obj)).not.toContain('stripeKey');
  });
});
