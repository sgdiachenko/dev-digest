import { describe, it, expect, vi } from 'vitest';
import type {
  EvalCase,
  EvalCaseInput,
  LLMProvider,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { EvalAttemptService } from '../src/modules/eval/attempt-service.js';
import { ATTEMPT_TTL_MS } from '../src/modules/eval/constants.js';
import type { EvalAgent, EvalStore } from '../src/modules/eval/types.js';

const WS = 'ws-1';
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const AGENT: EvalAgent = {
  id: 'agent-1',
  name: 'A',
  version: 1,
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  strategy: 'single-pass',
  system_prompt: 'PROMPT',
};

const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 's',
  score: 40,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'r',
      suggestion: null,
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

const INPUT = {
  name: 'must-find-key',
  type: 'must_find',
  input_diff: DIFF,
  input_meta: { pr_title: 'T', pr_body: null, pr_number: 1, repo_full_name: null },
  expectations: [
    { file: 'src/config.ts', start_line: 11, end_line: 11, severity: null, category: null, title: null },
  ],
  source_finding_id: null,
  diff_source: 'manual',
  notes: null,
} as EvalCaseInput;

/** Every store method is a spy; calling any of them is a test failure (AC-39). */
function strictStore(extra: Partial<Record<keyof EvalStore, unknown>> = {}) {
  const calls: string[] = [];
  const store = new Proxy(extra, {
    get(target, key: string) {
      if (key in target) {
        return (...args: unknown[]) => {
          calls.push(key);
          return (target[key as keyof EvalStore] as (...a: unknown[]) => unknown)(...args);
        };
      }
      return () => {
        calls.push(key);
        throw new Error(`unexpected store call: ${key}`);
      };
    },
  }) as unknown as EvalStore;
  return { store, calls };
}

function llmWith(respond: () => Promise<StructuredResult<unknown>>) {
  const seen: StructuredRequest<unknown>[] = [];
  const llm: LLMProvider = {
    id: 'openrouter',
    listModels: async () => [],
    complete: async () => {
      throw new Error('no');
    },
    completeStructured: async <T,>(req: StructuredRequest<T>) => {
      seen.push(req as StructuredRequest<unknown>);
      return (await respond()) as StructuredResult<T>;
    },
    embed: async () => [],
  };
  return { llm, seen };
}

const okResult = (): StructuredResult<unknown> => ({
  data: REVIEW,
  model: 'm',
  tokensIn: 1,
  tokensOut: 1,
  costUsd: 0.001,
  raw: '{}',
  attempts: 1,
});

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function make(opts: {
  respond?: () => Promise<StructuredResult<unknown>>;
  agent?: EvalAgent | null;
  store?: EvalStore;
  now?: () => number;
}) {
  const { llm, seen } = llmWith(opts.respond ?? (async () => okResult()));
  const { store, calls } = strictStore();
  const svc = new EvalAttemptService(
    opts.store ?? store,
    { get: async () => (opts.agent === undefined ? AGENT : opts.agent) },
    { forAgentWithVersion: async () => [] },
    async () => llm,
    logger,
    opts.now,
  );
  return { svc, seen, calls };
}

describe('EvalAttemptService', () => {
  it('start returns an attempt id; get reads running, then done with the result (AC-57)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { svc } = make({
      respond: async () => {
        await gate;
        return okResult();
      },
    });
    const { attempt_id } = await svc.start(WS, AGENT.id, INPUT);
    expect(svc.get(WS, attempt_id)).toMatchObject({ attempt_id, status: 'running', result: null });
    release();
    await vi.waitFor(() => expect(svc.get(WS, attempt_id).status).toBe('done'));
    const done = svc.get(WS, attempt_id);
    expect(done.result).toMatchObject({ status: 'pass', case_id: null, case_name: 'must-find-key' });
    expect(done.started_at).toMatch(/^\d{4}-/);
  });

  it('runs the draft against the CURRENT agent configuration (AC-57)', async () => {
    const { svc, seen } = make({});
    const { attempt_id } = await svc.start(WS, AGENT.id, INPUT);
    await vi.waitFor(() => expect(svc.get(WS, attempt_id).status).toBe('done'));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.messages[0]!.content).toContain('PROMPT');
  });

  it('writes nothing to the store, neither on start nor on finish (AC-39, AC-167)', async () => {
    const { svc, calls } = make({});
    const { attempt_id } = await svc.start(WS, AGENT.id, INPUT);
    await vi.waitFor(() => expect(svc.get(WS, attempt_id).status).toBe('done'));
    expect(calls).toEqual([]);
  });

  it('a failed review is an error attempt with a reason, not a pass (AC-161)', async () => {
    const { svc } = make({
      respond: async () => {
        throw new Error('boom');
      },
    });
    const { attempt_id } = await svc.start(WS, AGENT.id, INPUT);
    await vi.waitFor(() => expect(svc.get(WS, attempt_id).status).toBe('error'));
    expect(svc.get(WS, attempt_id).result).toMatchObject({ status: 'error', error_reason: 'provider_error' });
  });

  it('404 attempt_not_found for an unknown, foreign or expired attempt (AC-159, EC-18)', async () => {
    let t = 1_000;
    const { svc } = make({ now: () => t });
    expect(() => svc.get(WS, 'nope')).toThrowError(
      expect.objectContaining({ code: 'attempt_not_found', statusCode: 404 }),
    );
    const { attempt_id } = await svc.start(WS, AGENT.id, INPUT);
    expect(() => svc.get('ws-other', attempt_id)).toThrowError(
      expect.objectContaining({ code: 'attempt_not_found' }),
    );
    t += ATTEMPT_TTL_MS + 1;
    expect(() => svc.get(WS, attempt_id)).toThrowError(
      expect.objectContaining({ code: 'attempt_not_found' }),
    );
  });

  it('404 when the agent does not exist', async () => {
    const { svc } = make({ agent: null });
    await expect(svc.start(WS, 'ghost', INPUT)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('startForCase runs the SAVED case (AC-67)', async () => {
    const saved = {
      id: 'case-9',
      owner_kind: 'agent',
      owner_id: AGENT.id,
      name: 'saved-case',
      type: 'must_find',
      input_diff: DIFF,
      input_meta: INPUT.input_meta,
      expectations: INPUT.expectations,
    } as unknown as EvalCase;
    const getCase = vi.fn(async () => saved);
    const { store } = strictStore({ getCase });
    const { svc } = make({ store });
    const { attempt_id } = await svc.startForCase(WS, 'case-9');
    expect(getCase).toHaveBeenCalledWith(WS, 'case-9');
    await vi.waitFor(() => expect(svc.get(WS, attempt_id).status).toBe('done'));
    expect(svc.get(WS, attempt_id).result).toMatchObject({ case_id: 'case-9', case_name: 'saved-case' });

    const { store: empty } = strictStore({ getCase: async () => null });
    await expect(make({ store: empty }).svc.startForCase(WS, 'gone')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
