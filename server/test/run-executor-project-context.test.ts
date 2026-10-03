import { describe, it, expect, vi } from 'vitest';
import type { CompletionRequest, ProjectContextTrace } from '@devdigest/shared';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { RunBus } from '../src/platform/sse.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import type { Logger, PromptSkill } from '../src/modules/reviews/run-executor.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import type { AgentRow } from '../src/db/rows.js';
import type { PullRow } from '../src/modules/reviews/repository.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type {
  ProjectContextForRun,
  ProjectContextForRunInput,
  RunContextResult,
} from '../src/modules/context-attachments/types.js';

/**
 * T10 — the run executor's Project Context injection, driven through `executeRuns` with fakes
 * for every port (no DB, no network). Covers what the Live Log says and when, what reaches the
 * engine, and what the persisted trace records on success / failure.
 */

const SECRET_VALUE = 'sk_live_DO_NOT_LEAK';
const DOC_TEXT = 'DOC-A-BODY-TEXT-UNIQUE';

const DIFF_ONE = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "x",
   redisUrl: x,`;

const DIFF_TWO = `${DIFF_ONE}
diff --git a/docs/a.md b/docs/a.md
--- a/docs/a.md
+++ b/docs/a.md
@@ -1,2 +1,3 @@
 # A
+changed
 end`;

const REVIEW = { verdict: 'comment', summary: 'ok', score: 90, findings: [] };

const AGENT = {
  id: 'agent-1',
  name: 'Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'You are a reviewer.',
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: false,
  version: 3,
} as unknown as AgentRow;

const PULL = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 7,
  title: 'T',
  body: null,
  base: 'main',
  headSha: 'abc',
} as unknown as PullRow;

const REPO = { owner: 'acme', name: 'api' } as never;

type SavedTrace = Record<string, any>;

function resolved(over: Partial<Extract<RunContextResult, { kind: 'resolved' }>> = {}): RunContextResult {
  const trace: ProjectContextTrace = {
    sha: 'sha-1',
    budget_tokens: 8000,
    total_est_tokens: 120,
    docs: [
      { path: 'docs/a.md', source: 'agent', skill_name: null, est_tokens: 120, status: 'injected', reason: null },
    ],
  };
  return {
    kind: 'resolved',
    sha: 'sha-1',
    docs: [{ path: 'docs/a.md', text: DOC_TEXT }],
    trace,
    secretPaths: [],
    allReadsFailed: false,
    ...over,
  };
}

async function run(opts: {
  result?: RunContextResult | (() => Promise<RunContextResult>);
  diff?: string;
  strategy?: 'single-pass' | 'map-reduce';
  skills?: PromptSkill[];
  llmFails?: boolean;
  providerFails?: boolean;
  cancelAfterFirstCall?: boolean;
}) {
  const bus = new RunBus();
  const runId = 'run-1';
  const saved: SavedTrace[] = [];
  const completed: { status: string }[] = [];
  const repo = {
    completeAgentRun: async (_id: string, r: { status: string }) => void completed.push(r),
    saveRunTrace: async (_id: string, t: SavedTrace) => void saved.push(t),
    insertReviewWithFindings: async () => ({ review: { id: 'rev-1' }, findings: [] }),
    markReviewed: async () => undefined,
    getPrFiles: async () => [],
  } as unknown as ReviewRepository;

  const llm = new MockLLMProvider('openai', { structured: REVIEW });
  const requests: CompletionRequest[] = [];
  const logAtFirstCall: string[][] = [];
  const structured = llm.completeStructured.bind(llm);
  llm.completeStructured = (async (req: never) => {
    if (logAtFirstCall.length === 0) logAtFirstCall.push(bus.buffer(runId).map((e) => e.msg));
    requests.push(req);
    if (opts.llmFails) throw new Error('LLM exploded');
    const out = await structured(req);
    // The engine checks cancellation between map files, i.e. after the first call here.
    if (opts.cancelAfterFirstCall) bus.cancel(runId);
    return out;
  }) as typeof llm.completeStructured;

  const resolveForRun = vi.fn(async (_input: ProjectContextForRunInput, _logger?: unknown) => {
    const r = opts.result ?? { kind: 'none' as const };
    return typeof r === 'function' ? r() : r;
  });
  const projectContext: ProjectContextForRun = { resolveForRun };
  const logCalls: unknown[][] = [];
  const logger: Logger = {
    info: (...a) => void logCalls.push(a),
    warn: (...a) => void logCalls.push(a),
    error: (...a) => void logCalls.push(a),
    debug: (...a) => void logCalls.push(a),
  };

  const executor = new ReviewRunExecutor(
    repo,
    bus,
    async () => {
      if (opts.providerFails) throw new Error('no key');
      return llm;
    },
    {} as RepoIntel,
    new MockGitClient({ diff: opts.diff ?? DIFF_ONE }),
    { forAgent: async () => opts.skills ?? [] },
    { deriveForReview: async () => Promise.reject(new Error('no intent')) },
    projectContext,
  );
  await executor.executeRuns(
    'ws-1',
    PULL,
    REPO,
    [{ agent: { ...AGENT, strategy: opts.strategy ?? 'single-pass' } as AgentRow, runId }],
    logger,
  );
  return { bus, runId, saved, completed, requests, logAtFirstCall, resolveForRun, logCalls };
}

const logMsgs = (r: Awaited<ReturnType<typeof run>>) => r.bus.buffer(r.runId).map((e) => e.msg);
const userOf = (r: Awaited<ReturnType<typeof run>>) => r.requests[0]!.messages[1]!.content;

describe('ReviewRunExecutor — project context', () => {
  it('injects the docs, writes the summary line before the first LLM call, stores the trace (AC-19, AC-27, AC-31)', async () => {
    const r = await run({ result: resolved() });
    expect(userOf(r)).toContain('## Project context');
    expect(userOf(r)).toContain(DOC_TEXT);
    expect(r.logAtFirstCall[0]).toContain('Project context: 1 docs, ≈120 tokens');
    const trace = r.saved[0]!;
    expect(trace.specs_read).toEqual(['docs/a.md']);
    expect(trace.project_context.sha).toBe('sha-1');
    expect(trace.project_context.docs[0].status).toBe('injected');
    expect(trace.prompt_assembly.specs).toContain(DOC_TEXT);
  });

  it('resolves exactly once per run, with the injected skills (EC-19, AC-20)', async () => {
    const skills: PromptSkill[] = [{ id: 's1', name: 'Sec', body: 'b', source: 'manual' }];
    const r = await run({ result: resolved(), skills });
    expect(r.resolveForRun).toHaveBeenCalledTimes(1);
    expect(r.resolveForRun.mock.calls[0]![0]).toEqual({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      repoId: 'repo-1',
      injectedSkills: [{ id: 's1', name: 'Sec' }],
    });
  });

  it('nothing to inject: no block, null trace, empty specs_read, zero-docs line (AC-26, D10)', async () => {
    const none = await run({ result: { kind: 'none' } });
    const unavailable = await run({ result: { kind: 'unavailable', reason: 'no_clone' } });
    expect(userOf(none)).not.toContain('## Project context');
    expect(userOf(none)).toBe(userOf(unavailable));
    const trace = none.saved[0]!;
    expect(trace.project_context).toBeNull();
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.specs).toBeNull();
    expect(logMsgs(none)).toContain('Project context: 0 docs, ≈0 tokens');
  });

  it('unavailable: logs the reason and the run still completes without the block (AC-24)', async () => {
    const r = await run({ result: { kind: 'unavailable', reason: 'timeout' } });
    expect(logMsgs(r)).toContain('Project context unavailable: timeout');
    expect(r.completed[0]!.status).toBe('done');
    expect(r.saved[0]!.project_context).toBeNull();
  });

  it('a throwing resolver never fails the run (C9)', async () => {
    const r = await run({ result: () => Promise.reject(new Error('boom')) });
    expect(r.completed[0]!.status).toBe('done');
    expect(logMsgs(r).some((m) => m.startsWith('Project context failed'))).toBe(true);
    expect(userOf(r)).not.toContain('## Project context');
  });

  it('map-reduce: the line carries "× N calls" (AC-27, NFR-2)', async () => {
    const r = await run({ result: resolved(), diff: DIFF_TWO, strategy: 'map-reduce' });
    expect(logMsgs(r)).toContain('Project context: 1 docs, ≈120 tokens × 2 calls');
    expect(r.requests.length).toBeGreaterThanOrEqual(2);
    for (const req of r.requests.slice(0, 2)) expect(req.messages[1]!.content).toContain(DOC_TEXT);
  });

  it('drops documents over the 48,000-char safeguard as skipped/over_budget (D2, AC-25)', async () => {
    const big = 'x'.repeat(50_000);
    const result = resolved({
      docs: [
        { path: 'docs/a.md', text: DOC_TEXT },
        { path: 'docs/big.md', text: big },
      ],
      trace: {
        sha: 'sha-1',
        budget_tokens: 8000,
        total_est_tokens: 320,
        docs: [
          { path: 'docs/a.md', source: 'agent', skill_name: null, est_tokens: 120, status: 'injected', reason: null },
          { path: 'docs/big.md', source: 'agent', skill_name: null, est_tokens: 200, status: 'injected', reason: null },
        ],
      },
    });
    const r = await run({ result });
    expect(userOf(r)).toContain(DOC_TEXT);
    expect(userOf(r)).not.toContain(big);
    const trace = r.saved[0]!;
    expect(trace.specs_read).toEqual(['docs/a.md']);
    expect(trace.project_context.docs[1]).toMatchObject({ status: 'skipped', reason: 'over_budget' });
    expect(trace.project_context.total_est_tokens).toBe(120);
    expect(r.logAtFirstCall[0]).toContain('Project context: 1 docs, ≈120 tokens, skipped 1 (over_budget: 1)');
  });

  it('notes an injected document the diff also changes, without its text (AC-28)', async () => {
    const r = await run({ result: resolved(), diff: DIFF_TWO });
    const notes = logMsgs(r).filter((m) => m.includes('docs/a.md') && m.includes('changed by this PR'));
    expect(notes).toHaveLength(1);
    expect(notes[0]).not.toContain(DOC_TEXT);
    const untouched = await run({ result: resolved() });
    expect(logMsgs(untouched).some((m) => m.includes('changed by this PR'))).toBe(false);
  });

  it('warns about a secret path by name only, never the value (AC-29, NFR-7)', async () => {
    const r = await run({
      result: resolved({ docs: [{ path: 'docs/a.md', text: `token ${SECRET_VALUE}` }], secretPaths: ['docs/a.md'] }),
    });
    const notes = logMsgs(r).filter((m) => m.includes('may contain a secret'));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('docs/a.md');
    expect(JSON.stringify(r.bus.buffer(r.runId))).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(r.logCalls)).not.toContain(SECRET_VALUE);
    // the persisted log too
    expect(JSON.stringify(r.saved[0]!.log)).not.toContain(SECRET_VALUE);
  });

  it('never writes document text to the server logger (NFR-7)', async () => {
    const r = await run({ result: resolved() });
    expect(JSON.stringify(r.logCalls)).not.toContain(DOC_TEXT);
    expect(JSON.stringify(r.bus.buffer(r.runId))).not.toContain(DOC_TEXT);
  });

  it('notes when every attached document failed to read', async () => {
    const r = await run({
      result: {
        kind: 'resolved',
        sha: 'sha-1',
        docs: [],
        allReadsFailed: true,
        secretPaths: [],
        trace: {
          sha: 'sha-1',
          budget_tokens: 8000,
          total_est_tokens: 0,
          docs: [{ path: 'docs/a.md', source: 'agent', skill_name: null, est_tokens: null, status: 'skipped', reason: 'missing' }],
        },
      },
    });
    expect(logMsgs(r)).toContain('Project context: no attached document could be read');
    expect(userOf(r)).not.toContain('## Project context');
    expect(r.saved[0]!.project_context.docs[0].reason).toBe('missing');
  });

  it('failure after the engine was entered keeps specs_read, project_context and the block (EC-21)', async () => {
    const r = await run({ result: resolved(), llmFails: true });
    expect(r.completed[0]!.status).toBe('failed');
    const trace = r.saved[0]!;
    expect(trace.specs_read).toEqual(['docs/a.md']);
    expect(trace.project_context.docs).toHaveLength(1);
    expect(trace.prompt_assembly.specs).toContain(DOC_TEXT);
  });

  it('a cancelled run keeps specs_read and project_context like a failed one (AC-30)', async () => {
    const r = await run({ result: resolved(), diff: DIFF_TWO, strategy: 'map-reduce', cancelAfterFirstCall: true });
    expect(r.completed[0]!.status).toBe('cancelled');
    const trace = r.saved[0]!;
    expect(trace.specs_read).toEqual(['docs/a.md']);
    expect(trace.project_context.docs).toHaveLength(1);
    expect(trace.prompt_assembly.specs).toContain(DOC_TEXT);
  });

  it('failure before resolution records no project context and no block (EC-21)', async () => {
    const r = await run({ result: resolved(), providerFails: true });
    expect(r.completed[0]!.status).toBe('failed');
    expect(r.resolveForRun).not.toHaveBeenCalled();
    const trace = r.saved[0]!;
    expect(trace.specs_read).toEqual([]);
    expect(trace.project_context).toBeNull();
    expect(trace.prompt_assembly.specs).toBeNull();
  });
});
