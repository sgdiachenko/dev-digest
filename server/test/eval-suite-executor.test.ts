import { describe, it, expect, vi } from 'vitest';
import type {
  EvalCase,
  EvalSuiteRun,
  LLMProvider,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { EvalSuiteRunService, type SuiteRunStore } from '../src/modules/eval/suite-run-service.js';
import type { CaseResultRecord, EvalAgent, RunFinish } from '../src/modules/eval/types.js';
import { AppError, ConfigError } from '../src/platform/errors.js';

const WS = 'ws-1';
const SECRET_DIFF_LINE = '+  stripeKey: "sk_live_SECRET-DIFF-LINE",';
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
${SECRET_DIFF_LINE}
   redisUrl: x,`;

const finding = (line: number, id: string) => ({
  id,
  severity: 'CRITICAL' as const,
  category: 'security' as const,
  title: 'Hardcoded key',
  file: 'src/config.ts',
  start_line: line,
  end_line: line,
  rationale: 'RATIONALE',
  suggestion: null,
  confidence: 0.9,
  kind: 'finding' as const,
});
const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 's',
  score: 40,
  findings: [finding(11, 'f1'), finding(999, 'f2')], // f2 is dropped by grounding
};

const makeAgent = (): EvalAgent => ({
  id: 'agent-1',
  name: 'Agent',
  version: 3,
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  strategy: 'single-pass',
  system_prompt: 'SYSTEM-PROMPT-XYZ',
});

const makeCase = (id: string, n: number): EvalCase => ({
  id,
  owner_kind: 'agent',
  owner_id: 'agent-1',
  name: `case-${id}`,
  type: 'must_find',
  input_diff: DIFF,
  input_meta: { pr_title: 'TITLE-XYZ', pr_body: 'BODY-XYZ', pr_number: 1, repo_full_name: null },
  expectations: [
    { file: 'src/config.ts', start_line: 11, end_line: 11, severity: null, category: 'EXPECTED-XYZ', title: null },
  ],
  source_finding_id: null,
  diff_source: 'manual',
  notes: null,
  created_at: new Date(2026, 9, 1, 0, n).toISOString(),
  updated_at: new Date(2026, 9, 1, 0, n).toISOString(),
  last_result: null,
  source: null,
});

class FakeStore {
  cases: EvalCase[] = [];
  events: string[] = [];
  saved: CaseResultRecord[] = [];
  finishes: RunFinish[] = [];
  created: Array<{ agent_version: number; config: { system_prompt: string; skills: unknown[] }; case_ids: string[] }> = [];
  status: EvalSuiteRun['status'] = 'queued';
  deleted = new Set<string>();
  activeFor = new Set<string>();
  agentsWithCases: string[] = ['agent-1'];
  createError: Error | null = null;

  listCases = async () => [...this.cases].reverse(); // the store lists newest first
  createRunWithCases = async (_ws: string, run: FakeStore['created'][number] & { agent_id: string }) => {
    if (this.createError) throw this.createError;
    this.created.push(run);
    this.status = 'queued';
    return { run_id: `run-${this.created.length}` };
  };
  markRunRunning = async () => {
    this.status = 'running';
  };
  setCaseRunning = async (_r: string, c: string) => {
    this.events.push(`start:${c}`);
  };
  saveCaseResult = async (_r: string, rec: CaseResultRecord) => {
    this.events.push(`save:${rec.case_id}`);
    this.saved.push(rec);
    return !this.deleted.has(rec.case_id);
  };
  finishRun = async (_r: string, f: RunFinish) => {
    if (this.status !== 'queued' && this.status !== 'running') return;
    this.events.push('finish');
    this.finishes.push(f);
    this.status = f.status;
  };
  cancelRun = async () => {
    if (this.status !== 'queued' && this.status !== 'running') return false;
    this.events.push('cancel');
    this.status = 'cancelled';
    return true;
  };
  getRun = async (_ws: string, id: string) =>
    id.startsWith('run-')
      ? ({
          id,
          agent_id: 'agent-1',
          status: this.status,
          config: { system_prompt: 'P', skills: [] },
          per_case: [],
        } as unknown as EvalSuiteRun)
      : null;
  activeRun = async (_ws: string, agentId: string) => (this.activeFor.has(agentId) ? { id: 'x' } : null);
  agentIdsWithCases = async () => this.agentsWithCases;
  reapActiveRuns = async () => 2;
}

interface Harness {
  store: FakeStore;
  agent: EvalAgent;
  svc: EvalSuiteRunService;
  prompts: string[];
  calls: () => number;
  maxConcurrent: () => number;
  logs: unknown[];
}

function harness(
  respond?: (req: StructuredRequest<unknown>, n: number) => Promise<StructuredResult<unknown>>,
  resolveLlm?: () => Promise<LLMProvider>,
): Harness {
  const store = new FakeStore();
  const agent = makeAgent();
  const prompts: string[] = [];
  let n = 0;
  let inFlight = 0;
  let max = 0;
  const llm: LLMProvider = {
    id: 'openrouter',
    listModels: async () => [],
    complete: async () => {
      throw new Error('no');
    },
    completeStructured: async <T,>(req: StructuredRequest<T>) => {
      n += 1;
      inFlight += 1;
      max = Math.max(max, inFlight);
      prompts.push(String(req.messages[0]!.content));
      try {
        if (respond) return (await respond(req as StructuredRequest<unknown>, n)) as StructuredResult<T>;
        await new Promise((r) => setTimeout(r, 3));
        return {
          data: REVIEW,
          model: 'm',
          tokensIn: 1,
          tokensOut: 1,
          costUsd: 0.01,
          raw: 'RAW-OUTPUT-XYZ',
          attempts: 1,
        } as StructuredResult<T>;
      } finally {
        inFlight -= 1;
      }
    },
    embed: async () => [],
  };
  const logs: unknown[] = [];
  const sink = (obj: unknown, msg?: string) => void logs.push({ obj, msg });
  const svc = new EvalSuiteRunService(
    store as unknown as SuiteRunStore,
    { get: async () => agent },
    { forAgentWithVersion: async () => [{ id: 's1', name: 'Rules', body: 'SKILL', source: 'manual', version: 7 }] },
    resolveLlm ?? (async () => llm),
    { info: sink, warn: sink, error: sink },
  );
  return { store, agent, svc, prompts, calls: () => n, maxConcurrent: () => max, logs };
}

describe('EvalSuiteRunService', () => {
  it('runs cases strictly one after another, oldest first (AC-76)', async () => {
    const h = harness();
    h.store.cases = [makeCase('c1', 1), makeCase('c2', 2), makeCase('c3', 3)];
    const { run_id } = await h.svc.start(WS, 'agent-1');
    await h.svc.idle();
    expect(run_id).toBe('run-1');
    expect(h.maxConcurrent()).toBe(1);
    expect(h.store.events).toEqual([
      'start:c1', 'save:c1', 'start:c2', 'save:c2', 'start:c3', 'save:c3', 'finish',
    ]);
    expect(h.store.finishes[0]).toMatchObject({ status: 'completed', cases_total: 3, recall: 1 });
  });

  it('pins config, skills and the case set at start (AC-73, AC-74)', async () => {
    const h = harness();
    h.store.cases = [makeCase('c1', 1), makeCase('c2', 2)];
    await h.svc.start(WS, 'agent-1');
    h.agent.system_prompt = 'EDITED-AFTER-START'; // AC-74, EC-15
    await h.svc.idle();
    expect(h.prompts.every((p) => p.includes('SYSTEM-PROMPT-XYZ'))).toBe(true);
    expect(h.prompts.some((p) => p.includes('EDITED-AFTER-START'))).toBe(false);
    expect(h.store.created[0]).toMatchObject({
      agent_version: 3,
      config: { system_prompt: 'SYSTEM-PROMPT-XYZ', skills: [{ id: 's1', version: 7 }] },
      case_ids: ['c1', 'c2'],
    });
  });

  it('a case added after start is not run; one deleted after start still runs from the snapshot (AC-75, EC-16)', async () => {
    const h = harness();
    h.store.cases = [makeCase('c1', 1), makeCase('c2', 2)];
    await h.svc.start(WS, 'agent-1');
    h.store.cases.push(makeCase('c3', 3));
    h.store.deleted.add('c2');
    await h.svc.idle();
    expect(h.calls()).toBe(2);
    expect(h.store.events.filter((e) => e.startsWith('save:'))).toEqual(['save:c1', 'save:c2']);
    expect(h.store.finishes[0]).toMatchObject({ cases_total: 2, cases_completed: 2 });
  });

  it('an erroring case keeps its reason and the next case still runs (AC-161, AC-162, NFR-4)', async () => {
    let n = 0;
    const h = harness(async () => {
      n += 1;
      if (n === 2) throw new ConfigError('no key');
      return {
        data: REVIEW, model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0.01, raw: '{}', attempts: 1,
      };
    });
    h.store.cases = [makeCase('c1', 1), makeCase('c2', 2), makeCase('c3', 3)];
    await h.svc.start(WS, 'agent-1');
    await h.svc.idle();
    expect(h.calls()).toBe(3); // no automatic retry of the failed case
    expect(h.store.saved.map((s) => s.status)).toEqual(['pass', 'error', 'pass']);
    expect(h.store.saved[1]!.result.error_reason).toBe('missing_key');
    expect(h.store.finishes[0]).toMatchObject({ status: 'partial', cases_errored: 1, cases_completed: 2 });
  });

  it('every case erroring fails the run with null metrics (AC-171, AC-172)', async () => {
    const h = harness(async () => {
      throw new Error('upstream down');
    });
    h.store.cases = [makeCase('c1', 1), makeCase('c2', 2)];
    await h.svc.start(WS, 'agent-1');
    await h.svc.idle();
    expect(h.store.finishes[0]).toMatchObject({
      status: 'failed',
      recall: null,
      precision: null,
      citation_accuracy: null,
      cases_passed: null,
      error_reason: 'provider_error',
    });
  });

  it('stores findings, drops with reasons, status, duration and cost — never the prompt or the diff (AC-88)', async () => {
    const h = harness();
    h.store.cases = [makeCase('c1', 1)];
    await h.svc.start(WS, 'agent-1');
    await h.svc.idle();
    const rec = h.store.saved[0]!;
    expect(rec.status).toBe('pass');
    expect(rec.result.actual_findings).toHaveLength(1);
    expect(rec.result.dropped_findings[0]!.reason).toBeTruthy();
    expect(rec.result.cost_usd).toBe(0.01);
    expect(rec.result.duration_ms).toEqual(expect.any(Number));
    const json = JSON.stringify(rec);
    expect(json).not.toContain('SYSTEM-PROMPT-XYZ');
    expect(json).not.toContain('SECRET-DIFF-LINE');
  });

  it('cancel stops before the next case; the run ends cancelled (AC-91)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const h = harness(async (_req, n) => {
      if (n === 1) await gate;
      return {
        data: REVIEW, model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0.01, raw: '{}', attempts: 1,
      };
    });
    h.store.cases = [makeCase('c1', 1), makeCase('c2', 2)];
    const { run_id } = await h.svc.start(WS, 'agent-1');
    await vi.waitFor(() => expect(h.calls()).toBe(1));
    const summary = await h.svc.cancel(WS, run_id);
    expect(summary.status).toBe('cancelled');
    expect(summary).not.toHaveProperty('per_case');
    release();
    await h.svc.idle();
    expect(h.calls()).toBe(1);
    expect(h.store.status).toBe('cancelled');
    expect(h.store.finishes).toHaveLength(0);
  });

  it('cancel of a finished run is 409 not_running; of an unknown run 404', async () => {
    const h = harness();
    h.store.cases = [makeCase('c1', 1)];
    const { run_id } = await h.svc.start(WS, 'agent-1');
    await h.svc.idle();
    await expect(h.svc.cancel(WS, run_id)).rejects.toMatchObject({ code: 'not_running', statusCode: 409 });
    await expect(h.svc.cancel(WS, 'missing')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('run-all skips agents with an active run and agents that lose the start race (AC-114)', async () => {
    const h = harness();
    h.store.cases = [makeCase('c1', 1)];
    h.store.agentsWithCases = ['agent-1', 'agent-busy', 'agent-raced']; // agents without cases are not listed
    h.store.activeFor.add('agent-busy');
    const startSpy = vi.spyOn(h.svc, 'start').mockImplementation(async (_ws, agentId) => {
      if (agentId === 'agent-raced') throw new AppError('run_active', 'x', 409);
      return { run_id: `run-for-${agentId}` };
    });
    expect(await h.svc.runAll(WS)).toEqual({ run_ids: ['run-for-agent-1'] });
    expect(startSpy).toHaveBeenCalledTimes(2);
  });

  it('422 no_cases; a run_active conflict from the store propagates with its details (AC-80, AC-82)', async () => {
    const h = harness();
    await expect(h.svc.start(WS, 'agent-1')).rejects.toMatchObject({ code: 'no_cases', statusCode: 422 });
    h.store.cases = [makeCase('c1', 1)];
    h.store.createError = new AppError('run_active', 'busy', 409, { active_run_id: 'run-0' });
    await expect(h.svc.start(WS, 'agent-1')).rejects.toMatchObject({
      code: 'run_active',
      details: { active_run_id: 'run-0' },
    });
    expect(h.calls()).toBe(0);
  });

  it('logs ids and numbers, never content (NFR-14)', async () => {
    const h = harness();
    h.store.cases = [makeCase('c1', 1)];
    const { run_id } = await h.svc.start(WS, 'agent-1');
    await h.svc.idle();
    const text = JSON.stringify(h.logs);
    for (const secret of [
      'SECRET-DIFF-LINE', 'BODY-XYZ', 'TITLE-XYZ', 'SYSTEM-PROMPT-XYZ', 'EXPECTED-XYZ', 'RAW-OUTPUT-XYZ', 'RATIONALE',
    ]) {
      expect(text).not.toContain(secret);
    }
    const finished = (h.logs as Array<{ obj: Record<string, unknown>; msg?: string }>).find(
      (l) => l.msg === 'eval run finished',
    )!;
    expect(finished.obj).toMatchObject({
      run_id,
      agent_id: 'agent-1',
      agent_version: 3,
      status: 'completed',
      recall: 1,
      cost_usd: 0.01,
    });
    expect(finished.obj).toHaveProperty('duration_ms');
  });

  it('reapOnBoot reports the swept runs', async () => {
    const h = harness();
    expect(await h.svc.reapOnBoot()).toBe(2);
  });
});
