import { describe, it, expect, vi } from 'vitest';
import type { EvalCase, EvalCaseInput, EvalSuiteRun } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { EvalService } from '../src/modules/eval/service.js';
import type { DraftSource, EvalAgent, EvalStore } from '../src/modules/eval/types.js';

const WS = 'ws-1';
const AGENT: EvalAgent = {
  id: 'agent-1',
  name: 'Security Reviewer',
  version: 2,
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  strategy: 'single-pass',
  system_prompt: 'You review code.',
};

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,\n   z: 1,\n';
const RAW_DIFF = `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`;

function source(over: Partial<DraftSource['finding']> = {}, run_id: string | null = null): DraftSource {
  return {
    finding: {
      id: 'f-1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'r',
      suggestion: null,
      confidence: 0.9,
      kind: 'finding',
      accepted_at: '2026-10-01T00:00:00.000Z',
      dismissed_at: null,
      ...over,
    },
    review: { id: 'rev-1', agent_id: AGENT.id, run_id, pr_id: 'pr-1' },
    pr: { title: 'Add config', body: 'Body', number: 7, repo_id: 'repo-1', repo_full_name: 'acme/api' },
    agent: { id: AGENT.id, name: AGENT.name },
  };
}

type StoreOver = Partial<Record<keyof EvalStore, unknown>>;
function makeStore(over: StoreOver = {}): EvalStore {
  const base: StoreOver = {
    getDraftSource: vi.fn(async () => source()),
    getRunTrace: vi.fn(async () => null),
    getPrPatches: vi.fn(async () => [{ path: 'src/config.ts', patch: PATCH }]),
    findCaseBySourceFinding: vi.fn(async () => null),
    countCases: vi.fn(async () => 0),
    insertCase: vi.fn(async (_ws: string, input: { name: string }) => ({ id: 'case-1', ...input })),
    updateCase: vi.fn(async () => null),
    deleteCase: vi.fn(async () => false),
    getRun: vi.fn(async () => null),
    recentRuns: vi.fn(async () => []),
    agentsOverview: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    listCases: vi.fn(async () => []),
  };
  return { ...base, ...over } as unknown as EvalStore;
}

const agents = (a: EvalAgent | null = AGENT) => ({ get: vi.fn(async () => a) });

const INPUT = {
  name: 'must-find-x',
  type: 'must_find',
  input_diff: RAW_DIFF,
  input_meta: { pr_title: 't', pr_body: null, pr_number: 1, repo_full_name: null },
  expectations: [
    { file: 'src/config.ts', start_line: 11, end_line: 11, severity: null, category: null, title: null },
  ],
  source_finding_id: null,
  diff_source: 'manual',
  notes: null,
} as EvalCaseInput;

describe('EvalService.getDraft', () => {
  it('builds a must_find draft from an accepted finding (AC-6)', async () => {
    const svc = new EvalService(makeStore(), agents());
    const d = await svc.getDraft(WS, 'f-1');
    expect(d).toMatchObject({
      name: 'must-find-hardcoded-stripe-secret-key',
      type: 'must_find',
      owner_id: AGENT.id,
      owner_name: AGENT.name,
      source_finding_id: 'f-1',
      input_meta: { pr_title: 'Add config', pr_body: 'Body', pr_number: 7, repo_full_name: 'acme/api' },
      expectations: [{ file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL' }],
      existing_case: null,
    });
    expect(d.input_diff).toContain('+  stripeKey');
    expect(d.input_diff).toContain('diff --git a/src/config.ts');
  });

  it('a dismissed finding becomes must_not_flag with the no- prefix', async () => {
    const store = makeStore({
      getDraftSource: vi.fn(async () => source({ accepted_at: null, dismissed_at: '2026-10-02T00:00:00.000Z' })),
    });
    const d = await new EvalService(store, agents()).getDraft(WS, 'f-1');
    expect(d.type).toBe('must_not_flag');
    expect(d.name).toBe('no-hardcoded-stripe-secret-key');
  });

  it('uses the run trace when it carries the diff (AC-11), else current pr_files (AC-12, EC-4)', async () => {
    const withTrace = makeStore({
      getDraftSource: vi.fn(async () => source({}, 'run-9')),
      getRunTrace: vi.fn(async () => ({
        prompt_assembly: { user: `## Diff to review\n${wrapUntrusted('diff', RAW_DIFF)}` },
      })),
      getPrPatches: vi.fn(async () => []),
    });
    expect((await new EvalService(withTrace, agents()).getDraft(WS, 'f-1')).diff_source).toBe('run_trace');

    const noTrace = makeStore({ getDraftSource: vi.fn(async () => source({}, 'run-9')) });
    expect((await new EvalService(noTrace, agents()).getDraft(WS, 'f-1')).diff_source).toBe(
      'current_pr_files',
    );
  });

  it('422 diff_unavailable when no stored diff has the finding hunk (AC-14)', async () => {
    const store = makeStore({ getPrPatches: vi.fn(async () => []) });
    await expect(new EvalService(store, agents()).getDraft(WS, 'f-1')).rejects.toMatchObject({
      code: 'diff_unavailable',
      statusCode: 422,
    });
    const farAway = makeStore({ getDraftSource: vi.fn(async () => source({ start_line: 500, end_line: 501 })) });
    await expect(new EvalService(farAway, agents()).getDraft(WS, 'f-1')).rejects.toMatchObject({
      code: 'diff_unavailable',
    });
  });

  it('422 finding_untriaged and agent_missing; 404 for an unknown finding (EC-2)', async () => {
    const open = makeStore({
      getDraftSource: vi.fn(async () => source({ accepted_at: null, dismissed_at: null })),
    });
    await expect(new EvalService(open, agents()).getDraft(WS, 'f-1')).rejects.toMatchObject({
      code: 'finding_untriaged',
      statusCode: 422,
    });
    const orphan = makeStore({ getDraftSource: vi.fn(async () => ({ ...source(), agent: null })) });
    await expect(new EvalService(orphan, agents()).getDraft(WS, 'f-1')).rejects.toMatchObject({
      code: 'agent_missing',
      statusCode: 422,
    });
    const none = makeStore({ getDraftSource: vi.fn(async () => null) });
    await expect(new EvalService(none, agents()).getDraft(WS, 'f-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('reports the existing case made from the same finding (AC-16, EC-10)', async () => {
    const store = makeStore({
      findCaseBySourceFinding: vi.fn(async () => ({ id: 'case-7', name: 'must-find-old' })),
    });
    const d = await new EvalService(store, agents()).getDraft(WS, 'f-1');
    expect(d.existing_case).toEqual({ id: 'case-7', name: 'must-find-old' });
    expect(store.findCaseBySourceFinding).toHaveBeenCalledWith(WS, AGENT.id, 'f-1');
  });

  it('asks the store for the caller workspace only (AC-133)', async () => {
    const store = makeStore();
    await new EvalService(store, agents()).getDraft('ws-other', 'f-1');
    expect(store.getDraftSource).toHaveBeenCalledWith('ws-other', 'f-1');
    expect(store.getPrPatches).toHaveBeenCalledWith('ws-other', 'pr-1');
  });
});

describe('EvalService cases', () => {
  it('createCase takes the owner from the path and rejects the 201st case (NFR-3)', async () => {
    const store = makeStore();
    await new EvalService(store, agents()).createCase(WS, AGENT.id, INPUT);
    expect(store.insertCase).toHaveBeenCalledWith(
      WS,
      expect.objectContaining({ owner_kind: 'agent', owner_id: AGENT.id, name: 'must-find-x' }),
    );

    const full = makeStore({ countCases: vi.fn(async () => 200) });
    await expect(new EvalService(full, agents()).createCase(WS, AGENT.id, INPUT)).rejects.toMatchObject({
      code: 'case_limit',
      statusCode: 422,
    });
    expect(full.insertCase).not.toHaveBeenCalled();
  });

  it('404 for an unknown agent / case, in this workspace only (AC-133)', async () => {
    const svc = new EvalService(makeStore(), agents(null));
    await expect(svc.createCase(WS, 'nope', INPUT)).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.listCases(WS, 'nope')).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.updateCase(WS, 'c', INPUT)).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.deleteCase(WS, 'c')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('updateCase returns the stored case', async () => {
    const saved = { id: 'case-1', name: 'must-find-x' } as EvalCase;
    const store = makeStore({ updateCase: vi.fn(async () => saved) });
    expect(await new EvalService(store, agents()).updateCase(WS, 'case-1', INPUT)).toBe(saved);
  });
});

function run(
  id: string,
  over: Partial<EvalSuiteRun> & { results?: Array<[string, 'pass' | 'fail' | 'error']> } = {},
): EvalSuiteRun {
  const { results = [], ...rest } = over;
  return {
    id,
    agent_id: AGENT.id,
    status: 'completed',
    agent_version: 1,
    config: {
      provider: 'openrouter',
      model: 'm',
      strategy: 'single-pass',
      system_prompt: 'P',
      skills: [],
      temperature: 0,
    },
    case_ids: results.map(([c]) => c),
    cases_total: results.length,
    cases_completed: results.length,
    cases_errored: 0,
    cases_passed: 0,
    recall: 0.5,
    precision: 0.5,
    citation_accuracy: 1,
    cost_usd: null,
    duration_ms: 1,
    started_at: '2026-10-01T00:00:00.000Z',
    finished_at: null,
    error_reason: null,
    per_case: results.map(([c, status]) => ({
      case_id: c,
      case_name: `name-${c}`,
      status,
      error_reason: null,
      actual_findings: [],
      dropped_findings: [],
      expected_count: 1,
      actual_count: 0,
      duration_ms: 1,
      cost_usd: null,
    })),
    ...rest,
  };
}

describe('EvalService runs, overview, compare', () => {
  const byId = (runs: EvalSuiteRun[]) => vi.fn(async (_ws: string, id: string) => runs.find((r) => r.id === id) ?? null);

  it('compare orders older -> newer and reports flips (AC-127, AC-165)', async () => {
    const older = run('r-old', { started_at: '2026-10-01T00:00:00.000Z', results: [['c1', 'pass'], ['c2', 'pass']] });
    const newer = run('r-new', { started_at: '2026-10-02T00:00:00.000Z', results: [['c1', 'fail'], ['c3', 'pass']] });
    const svc = new EvalService(makeStore({ getRun: byId([older, newer]) }), agents());
    // arguments in reverse order: still a = older
    const cmp = await svc.compare(WS, 'r-new', 'r-old');
    expect(cmp.a.id).toBe('r-old');
    expect(cmp.b.id).toBe('r-new');
    expect(cmp.case_set).toEqual({ added: ['c3'], removed: ['c2'] });
    expect(cmp.flips.find((f) => f.case_id === 'c1')?.flip).toBe('pass_to_fail');
    expect(cmp.flips.find((f) => f.case_id === 'c2')?.b).toBe('absent');
    expect(cmp.identical_config).toBe(true);
  });

  it('422 different_agents (AC-130) and no_metrics; 404 for a foreign run (AC-133)', async () => {
    const a = run('r-a');
    const b = run('r-b', { agent_id: 'agent-2' });
    const svc = new EvalService(makeStore({ getRun: byId([a, b, run('r-f', { status: 'failed' })]) }), agents());
    await expect(svc.compare(WS, 'r-a', 'r-b')).rejects.toMatchObject({
      code: 'different_agents',
      statusCode: 422,
    });
    await expect(svc.compare(WS, 'r-a', 'r-f')).rejects.toMatchObject({
      code: 'no_metrics',
      statusCode: 422,
    });
    await expect(svc.compare(WS, 'r-a', 'missing')).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.getRun(WS, 'missing')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('overview asks for the 6 most recent runs and passes the agents through', async () => {
    const agentsOverview = vi.fn(async () => [
      { agent_id: 'a', name: 'A', model: 'm', latest: null, recall_trend: [] },
    ]);
    const store = makeStore({ agentsOverview });
    const o = await new EvalService(store, agents()).overview(WS);
    expect(store.recentRuns).toHaveBeenCalledWith(WS, 6);
    expect(o.agents).toHaveLength(1);
  });

  it('listRuns forwards `since` and checks the agent', async () => {
    const store = makeStore();
    await new EvalService(store, agents()).listRuns(WS, AGENT.id, '2026-10-01T00:00:00.000Z');
    expect(store.listRuns).toHaveBeenCalledWith(
      WS,
      AGENT.id,
      expect.objectContaining({ since: '2026-10-01T00:00:00.000Z' }),
    );
    await expect(new EvalService(store, agents(null)).listRuns(WS, 'x')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
