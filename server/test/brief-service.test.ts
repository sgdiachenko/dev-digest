import { describe, it, expect, vi } from 'vitest';
import type {
  BlastRadiusResponse,
  FeatureModelChoice,
  GitHubClient,
  LLMProvider,
  PrIntentRecord,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import {
  BriefService,
  type BriefLimits,
  type BriefPull,
  type BriefPullStore,
  type BriefStore,
} from '../src/modules/brief/service.js';
import { StoredBrief } from '../src/modules/brief/helpers.js';
import type { BriefModelOutput } from '../src/modules/brief/prompt.js';
import type { RepoContextResult } from '../src/modules/context-attachments/types.js';
import { AppError, ConfigError } from '../src/platform/errors.js';

const HEAD = 'a'.repeat(40);
const CHOICE: FeatureModelChoice = { provider: 'openai', model: 'gpt-4.1' };
const PATCH = '@@ -1,2 +1,3 @@\n a\n+b\n c\n';
const FILES = [
  { path: 'src/a.ts', additions: 1, deletions: 0, patch: PATCH },
  { path: 'src/nopatch.ts', additions: 3, deletions: 0, patch: null },
];
const PULL: BriefPull = {
  id: 'p1',
  repoId: 'r1',
  title: 'Add things',
  body: 'Does stuff',
  branch: 'feature/x',
  headSha: HEAD,
  filesCount: 2,
};

const GOOD: BriefModelOutput = {
  summary: 'Adds things.',
  risks: [{ kind: 'security', title: 'Risky', explanation: 'Because', severity: 'high', file_refs: ['src/a.ts:2'] }],
  review_focus: [{ file: 'src/a.ts', line: 2, reason: 'start here' }],
};

const intentRecord = (over: Partial<PrIntentRecord> = {}): PrIntentRecord => ({
  pr_id: 'p1',
  intent: 'Do the thing',
  in_scope: ['a'],
  out_of_scope: [],
  confidence: 'high',
  sources: [],
  provider: 'openai',
  model: 'm',
  cost_usd: 0,
  tokens_in: 1,
  tokens_out: 1,
  head_sha: HEAD,
  stale: false,
  derived_at: new Date(0).toISOString(),
  ...over,
});

const blastResponse = (over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse => ({
  summary: 'sum',
  changed_symbols: [{ name: 'fn', file: 'src/a.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'fn',
      callers: [{ name: 'caller', file: 'src/other.ts', line: 3, endpoints_affected: ['GET /x'], crons_affected: [] }],
      endpoints_affected: ['GET /x'],
      crons_affected: [],
    },
  ],
  degraded: false,
  reason: null,
  ...over,
});

class Store implements BriefStore {
  doc: StoredBrief | null = null;
  replaces: StoredBrief[] = [];
  async get() {
    return this.doc;
  }
  async replace(_id: string, doc: StoredBrief) {
    this.replaces.push(doc);
    this.doc = doc;
  }
}

interface Opts {
  store?: Store;
  pull?: BriefPull | undefined;
  files?: typeof FILES;
  intent?: () => Promise<PrIntentRecord | null>;
  blast?: () => Promise<BlastRadiusResponse>;
  specs?: () => Promise<RepoContextResult>;
  issue?: () => Promise<{ number: number; title: string; body: string | null; state: string }>;
  github?: () => Promise<GitHubClient>;
  complete?: (req: StructuredRequest<unknown>) => Promise<StructuredResult<unknown>>;
  llmError?: Error;
  count?: (text: string) => number;
  now?: () => Date;
  limits?: Partial<BriefLimits>;
}

function setup(o: Opts = {}) {
  const store = o.store ?? new Store();
  const pullState = { pull: 'pull' in o ? o.pull : PULL } as { pull: BriefPull | undefined };
  const pulls: BriefPullStore = {
    findPull: vi.fn(async () => pullState.pull),
    findRepo: vi.fn(async () => ({ owner: 'acme', name: 'app' })),
    listFiles: vi.fn(async () => o.files ?? FILES),
  };
  const intent = { getIntent: vi.fn(o.intent ?? (async () => null)) };
  const blast = { getBlast: vi.fn(o.blast ?? (async () => blastResponse())) };
  const specs = { resolveForRepo: vi.fn(o.specs ?? (async (): Promise<RepoContextResult> => ({ kind: 'none' }))) };
  const getIssue = vi.fn(o.issue ?? (async () => ({ number: 7, title: 'Issue', body: 'body', state: 'open' })));
  const githubFor = vi.fn(o.github ?? (async () => ({ getIssue }) as unknown as GitHubClient));
  const complete = vi.fn(
    o.complete ??
      (async (req: StructuredRequest<unknown>): Promise<StructuredResult<unknown>> => ({
        data: GOOD,
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.01,
        raw: '',
        attempts: 1,
      })),
  );
  const llmFor = vi.fn(async () => {
    if (o.llmError) throw o.llmError;
    return { completeStructured: complete } as unknown as LLMProvider;
  });
  const logs: unknown[] = [];
  const logger = { info: (x: unknown) => logs.push(x), warn: (x: unknown) => logs.push(x) };
  const service = new BriefService(
    store,
    pulls,
    intent,
    blast,
    specs,
    githubFor,
    llmFor,
    async () => CHOICE,
    o.count ?? ((t) => Math.ceil(t.length / 4)),
    wrapUntrusted,
    o.now,
    o.limits,
  );
  return { service, store, pulls, intent, blast, specs, getIssue, githubFor, complete, llmFor, logs, logger, pullState };
}

const reasonOf = (err: unknown) => (err as AppError).details as { reason?: string; provider?: string };
const rejection = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (err) {
    return err as AppError;
  }
  throw new Error('expected a rejection');
};

describe('BriefService.getBrief', () => {
  it('404 for an unknown PR; null when nothing is stored; never touches LLM/GitHub/git', async () => {
    const s = setup({ pull: undefined });
    expect((await rejection(s.service.getBrief('w', 'p1'))).statusCode).toBe(404);

    const s2 = setup();
    expect(await s2.service.getBrief('w', 'p1')).toBeNull();
    expect(s2.complete).not.toHaveBeenCalled();
    expect(s2.llmFor).not.toHaveBeenCalled();
    expect(s2.githubFor).not.toHaveBeenCalled();
    expect(s2.blast.getBlast).not.toHaveBeenCalled();
  });

  it('returns the stored record, stale when the head moved on', async () => {
    const s = setup();
    await s.service.generate('w', 'p1');
    expect((await s.service.getBrief('w', 'p1'))?.stale).toBe(false);
    s.pullState.pull = { ...PULL, headSha: 'b'.repeat(40) };
    expect((await s.service.getBrief('w', 'p1'))?.stale).toBe(true);
  });
});

describe('BriefService.generate', () => {
  it('makes exactly one structured call with no retries, then stores and returns the record', async () => {
    const s = setup();
    const rec = await s.service.generate('w', 'p1', s.logger);
    expect(s.complete).toHaveBeenCalledTimes(1);
    const req = s.complete.mock.calls[0]![0];
    expect(req).toMatchObject({ model: 'gpt-4.1', maxRetries: 0, httpRetries: 0, schemaName: 'PrBriefOutput' });
    expect(rec).toMatchObject({
      pr_id: 'p1',
      head_sha: HEAD,
      stale: false,
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: 10,
      tokens_out: 5,
      cost_usd: 0.01,
      summary: 'Adds things.',
    });
    expect(rec.input_tokens_est).toBeGreaterThan(0);
    expect(s.store.replaces).toHaveLength(1);
    expect(StoredBrief.safeParse(s.store.replaces[0]).success).toBe(true);
    expect(s.intent.getIntent).toHaveBeenCalledTimes(1); // read only: never derived here
  });

  it('404 for an unknown PR without calling anything', async () => {
    const s = setup({ pull: undefined });
    expect((await rejection(s.service.generate('w', 'p1'))).statusCode).toBe(404);
    expect(s.complete).not.toHaveBeenCalled();
  });

  it('single-flight: two concurrent POSTs share one call and one outcome', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup({
      complete: async (req) => {
        await gate;
        return { data: GOOD, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: null, raw: '', attempts: 1 };
      },
    });
    const a = s.service.generate('w', 'p1');
    const b = s.service.generate('w', 'p1');
    await vi.waitFor(() => expect(s.complete).toHaveBeenCalledTimes(1));
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual(rb);
    expect(s.complete).toHaveBeenCalledTimes(1);
  });

  it('rate limit: the 11th request in a minute is 429 and starts nothing; the window slides', async () => {
    let nowMs = 1_000_000;
    const s = setup({ now: () => new Date(nowMs) });
    for (let i = 0; i < 10; i++) await s.service.generate('w', 'p1');
    const callsBefore = s.complete.mock.calls.length;
    expect((await rejection(s.service.generate('w', 'p1'))).statusCode).toBe(429);
    expect(s.complete.mock.calls.length).toBe(callsBefore);
    nowMs += 61_000;
    await expect(s.service.generate('w', 'p1')).resolves.toBeDefined();
  });

  it('409 no_diff_data without an LLM call when the PR has no stored files', async () => {
    const s = setup({ files: [] });
    const err = await rejection(s.service.generate('w', 'p1'));
    expect(err.statusCode).toBe(409);
    expect(reasonOf(err).reason).toBe('no_diff_data');
    expect(s.complete).not.toHaveBeenCalled();
  });

  it('409 missing_key with the provider when the key is missing, no call made', async () => {
    const s = setup({ llmError: new ConfigError('OPENAI_API_KEY is not configured') });
    const err = await rejection(s.service.generate('w', 'p1'));
    expect(err.statusCode).toBe(409);
    expect(reasonOf(err)).toEqual({ reason: 'missing_key', provider: 'openai' });
    expect(s.complete).not.toHaveBeenCalled();
    expect(s.store.replaces).toHaveLength(0);
  });

  it.each([
    ['llm_timeout', Object.assign(new Error('slow'), { name: 'APIConnectionTimeoutError' })],
    ['llm_error', Object.assign(new Error('429 quota exceeded'), { status: 429 })],
    ['invalid_output', new Error('fixture failed schema')],
  ])('%s: 502, previous brief untouched', async (reason, error) => {
    const store = new Store();
    const ok = setup({ store });
    await ok.service.generate('w', 'p1');
    const previous = store.doc;
    const s = setup({
      store,
      complete: async () => {
        throw error;
      },
    });
    const err = await rejection(s.service.generate('w', 'p1'));
    expect(err.statusCode).toBe(502);
    expect(reasonOf(err).reason).toBe(reason);
    expect(store.doc).toBe(previous);
    expect(store.replaces).toHaveLength(1);
  });

  it('invalid_output when the summary is empty or the output is unusable; nothing written', async () => {
    const s = setup({
      complete: async (req) => ({
        data: { ...GOOD, summary: '   ' },
        model: req.model,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: null,
        raw: '',
        attempts: 1,
      }),
    });
    const err = await rejection(s.service.generate('w', 'p1'));
    expect(reasonOf(err).reason).toBe('invalid_output');
    expect(s.store.replaces).toHaveLength(0);
  });

  it('null cost stays null (not 0)', async () => {
    const s = setup({
      complete: async (req) => ({ data: GOOD, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: null, raw: '', attempts: 1 }),
    });
    expect((await s.service.generate('w', 'p1')).cost_usd).toBeNull();
  });

  it('works for a closed or merged PR', async () => {
    const s = setup({ pull: { ...PULL } });
    await expect(s.service.generate('w', 'p1')).resolves.toBeDefined();
  });

  it('a late head SHA change reads as stale right away; the stored head_sha is the one read at the start', async () => {
    const s = setup({
      complete: async (req) => {
        s.pullState.pull = { ...PULL, headSha: 'c'.repeat(40) };
        return { data: GOOD, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '', attempts: 1 };
      },
    });
    const rec = await s.service.generate('w', 'p1');
    expect(rec.head_sha).toBe(HEAD);
    expect(rec.stale).toBe(true);
  });

  it('completes and stores even if the awaiting caller goes away (promise-level disconnect)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup({
      complete: async (req) => {
        await gate;
        return { data: GOOD, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '', attempts: 1 };
      },
    });
    void s.service.generate('w', 'p1'); // nobody ever awaits this
    await vi.waitFor(() => expect(s.complete).toHaveBeenCalledTimes(1));
    release();
    await vi.waitFor(() => expect(s.store.replaces).toHaveLength(1));
  });

  it('logs metadata only: no PR text, issue, spec or model output', async () => {
    const s = setup({
      intent: async () => intentRecord(),
      specs: async () => ({
        kind: 'resolved',
        sha: 'd'.repeat(40),
        docs: [{ path: 'docs/spec.md', text: 'SPEC-SECRET-TEXT', estTokens: 4 }],
      }),
    });
    await s.service.generate('w', 'p1', s.logger);
    const dump = JSON.stringify(s.logs);
    for (const secret of ['Does stuff', 'Add things', 'Do the thing', 'SPEC-SECRET-TEXT', 'Adds things.', 'Risky']) {
      expect(dump).not.toContain(secret);
    }
    expect(dump).toContain('durationMs');
  });

  it('AC-106: exactly one completion record on success, with the full metadata field set', async () => {
    const s = setup();
    await s.service.generate('w', 'p1', s.logger);
    expect(s.logs).toHaveLength(1);
    const log = s.logs[0] as Record<string, unknown>;
    expect(log).toMatchObject({
      outcome: 'ok',
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: 10,
      tokens_out: 5,
      cost_usd: 0.01,
      dropped: { refs: 0, risks: 0, focus: 0 },
    });
    expect(log.input_tokens_est).toBeGreaterThan(0);
    expect(log.budget).toMatchObject({ reduced: expect.anything() });
    expect(Array.isArray(log.trimmed_sections)).toBe(true);
    expect(Array.isArray(log.missing_sections)).toBe(true);
    expect(typeof log.durationMs).toBe('number');
    expect(log).not.toHaveProperty('reason');
  });

  it('AC-106: exactly one completion record on failure, with the reason and what is known by then', async () => {
    const s = setup({
      complete: async () => {
        throw Object.assign(new Error('429 quota exceeded'), { status: 429 });
      },
    });
    await rejection(s.service.generate('w', 'p1', s.logger));
    expect(s.logs).toHaveLength(1);
    const log = s.logs[0] as Record<string, unknown>;
    expect(log).toMatchObject({
      outcome: 'failed',
      reason: 'llm_error',
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      dropped: null,
    });
    expect(log.input_tokens_est).toBeGreaterThan(0);
    expect(log.budget).not.toBeNull();
    expect(Array.isArray(log.missing_sections)).toBe(true);
    expect(typeof log.durationMs).toBe('number');

    // failure before any model/provider is known: keys are present, values null
    const early = setup({ files: [] });
    await rejection(early.service.generate('w', 'p1', early.logger));
    expect(early.logs).toHaveLength(1);
    expect(early.logs[0]).toMatchObject({ outcome: 'failed', reason: 'no_diff_data', provider: null, model: null, input_tokens_est: null });
  });
});

describe('BriefService inputs', () => {
  const missingOf = async (o: Opts) => (await setup(o).service.generate('w', 'p1')).missing_inputs;

  it('intent: not_derived when absent, stale (but used) when derived for another SHA', async () => {
    expect(await missingOf({})).toContainEqual({ input: 'intent', reason: 'not_derived' });

    const s = setup({ intent: async () => intentRecord({ stale: true }) });
    const rec = await s.service.generate('w', 'p1');
    expect(rec.missing_inputs).toContainEqual({ input: 'intent', reason: 'stale' });
    expect(rec.intent).toEqual({ intent: 'Do the thing', in_scope: ['a'], out_of_scope: [] });
    expect(rec.missing_inputs).not.toContainEqual({ input: 'intent', reason: 'not_derived' });
  });

  it('blast: a throw is unavailable, a hang is timeout, a degraded one carries its reason; none is sent', async () => {
    expect(await missingOf({ blast: async () => Promise.reject(new Error('boom')) })).toContainEqual({
      input: 'blast',
      reason: 'unavailable',
    });
    expect(
      await missingOf({ blast: () => new Promise(() => {}), limits: { blastMs: 10 } }),
    ).toContainEqual({ input: 'blast', reason: 'timeout' });

    const s = setup({ blast: async () => blastResponse({ degraded: true, reason: 'index_failed' }) });
    const rec = await s.service.generate('w', 'p1');
    expect(rec.missing_inputs).toContainEqual({ input: 'blast', reason: 'index_failed' });
    expect(rec.blast).toBeNull();
  });

  it('blast: the stored blast is the projection (no endpoints / crons) that was sent', async () => {
    const rec = await setup().service.generate('w', 'p1');
    expect(rec.blast?.downstream[0]?.callers[0]).toEqual({
      name: 'caller',
      file: 'src/other.ts',
      line: 3,
      endpoints_affected: [],
      crons_affected: [],
    });
    expect(rec.blast?.downstream[0]?.endpoints_affected).toEqual([]);
  });

  it('blast files are valid risk refs; paths outside PR and blast are removed', async () => {
    const s = setup({
      complete: async (req) => ({
        data: {
          ...GOOD,
          risks: [
            { kind: 'perf', title: 'a', explanation: 'b', severity: 'low', file_refs: ['src/other.ts:3', 'nope.ts'] },
            { kind: 'perf', title: 'ghost', explanation: 'b', severity: 'low', file_refs: ['ghost.ts'] },
          ],
        },
        model: req.model,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0,
        raw: '',
        attempts: 1,
      }),
    });
    const rec = await s.service.generate('w', 'p1');
    expect(rec.risks.risks).toHaveLength(1);
    expect(rec.risks.risks[0]!.file_refs).toEqual(['src/other.ts:3']);
  });

  it('a caller trimmed by the budget is neither stored nor accepted as a file_ref', async () => {
    const callers = Array.from({ length: 60 }, (_, i) => ({
      name: `c${i}`,
      file: `src/caller-${i}.ts`,
      line: i + 1,
      endpoints_affected: [],
      crons_affected: [],
    }));
    const lastFile = 'src/caller-59.ts';
    const s = setup({
      blast: async () =>
        blastResponse({ downstream: [{ symbol: 'fn', callers, endpoints_affected: [], crons_affected: [] }] }),
      // while any caller is rendered the input is over budget: forces the callers to be trimmed
      count: (t) => Math.ceil(t.length / 4) + (t.includes('caller-') ? 9000 : 0),
      complete: async (req) => ({
        data: {
          ...GOOD,
          risks: [{ kind: 'perf', title: 't', explanation: 'e', severity: 'low', file_refs: [lastFile, 'src/a.ts'] }],
        },
        model: req.model,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0,
        raw: '',
        attempts: 1,
      }),
    });
    const rec = await s.service.generate('w', 'p1');
    const sentCallers = rec.blast?.downstream.flatMap((d) => d.callers.map((c) => c.file)) ?? [];
    expect(sentCallers).not.toContain(lastFile);
    expect(rec.risks.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(rec.missing_inputs).toContainEqual({ input: 'blast', reason: 'over_budget' });
  });

  it('linked issue: same-repo reference is fetched; github failure / timeout / no client is github_unavailable; none is silent', async () => {
    const withRef = { ...PULL, body: 'Fixes #7' };
    const ok = setup({ pull: withRef });
    const rec = await ok.service.generate('w', 'p1');
    expect(ok.getIssue).toHaveBeenCalledTimes(1);
    expect(rec.missing_inputs.some((m) => m.input === 'linked_issue')).toBe(false);

    for (const o of [
      { issue: async () => Promise.reject(new Error('404')) },
      { issue: () => new Promise<never>(() => {}), limits: { issueMs: 10 } },
      { github: async () => Promise.reject(new ConfigError('no token')) },
    ]) {
      const r = await setup({ pull: withRef, ...o }).service.generate('w', 'p1');
      expect(r.missing_inputs).toContainEqual({ input: 'linked_issue', reason: 'github_unavailable' });
    }

    const none = setup();
    const r = await none.service.generate('w', 'p1');
    expect(none.githubFor).not.toHaveBeenCalled();
    expect(r.missing_inputs.some((m) => m.input === 'linked_issue')).toBe(false);
  });

  it('specs: reasons map from the repo context result; resolved docs set specs_sha and specs_used', async () => {
    const reasons: [RepoContextResult, string][] = [
      [{ kind: 'unavailable', reason: 'no_clone' }, 'not_cloned'],
      [{ kind: 'unavailable', reason: 'no_catalog' }, 'no_catalog'],
      [{ kind: 'unavailable', reason: 'error' }, 'unavailable'],
      [{ kind: 'none' }, 'none_attached'],
    ];
    for (const [result, reason] of reasons) {
      expect(await missingOf({ specs: async () => result })).toContainEqual({ input: 'specs', reason });
    }
    expect(await missingOf({ specs: () => new Promise(() => {}), limits: { specsMs: 10 } })).toContainEqual({
      input: 'specs',
      reason: 'unavailable',
    });
    expect(
      await missingOf({ specs: () => Promise.reject(new Error('x')) }),
    ).toContainEqual({ input: 'specs', reason: 'unavailable' });

    const rec = await setup({
      specs: async () => ({
        kind: 'resolved',
        sha: 'd'.repeat(40),
        docs: [
          { path: 'docs/a.md', text: 'alpha', estTokens: 2 },
          { path: 'docs/b.md', text: 'beta', estTokens: 2 },
        ],
      }),
    }).service.generate('w', 'p1');
    expect(rec.specs_sha).toBe('d'.repeat(40));
    expect(rec.specs_used.map((s) => s.path)).toEqual(['docs/a.md', 'docs/b.md']);
    expect(rec.missing_inputs.some((m) => m.input === 'specs')).toBe(false);
  });

  it('AC-39: specs_sha is stored whenever specs resolved, even if every doc was skipped for budget; null otherwise', async () => {
    const sha = 'e'.repeat(40);
    const huge = 'x'.repeat(200_000);
    const over = await setup({
      specs: async () => ({ kind: 'resolved', sha, docs: [{ path: 'docs/big.md', text: huge, estTokens: 50_000 }] }),
      // a spec is only dropped once the input is over budget while it is rendered
      count: (t) => Math.ceil(t.length / 4) + (t.includes('docs/big.md') ? 9000 : 0),
    }).service.generate('w', 'p1');
    expect(over.specs_used).toEqual([]);
    expect(over.specs_sha).toBe(sha);

    const none = await setup({ specs: async () => ({ kind: 'none' }) }).service.generate('w', 'p1');
    expect(none.specs_sha).toBeNull();
  });

  it('diff_stats: truncated when the reported file count exceeds the stored rows', async () => {
    const s = setup({ pull: { ...PULL, filesCount: 9 } });
    expect((await s.service.generate('w', 'p1')).missing_inputs).toContainEqual({
      input: 'diff_stats',
      reason: 'truncated',
    });
  });

  it('line < 1 for a file without a patch is stored as line 1, unverified', async () => {
    const s = setup({
      complete: async (req) => ({
        data: { ...GOOD, review_focus: [{ file: 'src/nopatch.ts', line: 0, reason: 'x' }] },
        model: req.model,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0,
        raw: '',
        attempts: 1,
      }),
    });
    const rec = await s.service.generate('w', 'p1');
    expect(rec.review_focus).toEqual([{ file: 'src/nopatch.ts', line: 1, reason: 'x', line_verified: false }]);
  });
});

describe('BriefService guards', () => {
  it('budget guard: a counter that always answers 9000 -> 500 input_over_budget, no LLM call, no write', async () => {
    const s = setup({ count: () => 9000 });
    const err = await rejection(s.service.generate('w', 'p1'));
    expect(err.statusCode).toBe(500);
    expect(reasonOf(err).reason).toBe('input_over_budget');
    expect(s.complete).not.toHaveBeenCalled();
    expect(s.store.replaces).toHaveLength(0);
  });

  it('deadline: a hanging blast and a late LLM -> 502 llm_timeout and nothing is written, even after the late resolve', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup({
      limits: { requestDeadlineMs: 60, blastMs: 10_000 },
      blast: async () => {
        await gate;
        return blastResponse();
      },
      complete: async (req) => ({ data: GOOD, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '', attempts: 1 }),
    });
    const err = await rejection(s.service.generate('w', 'p1', s.logger));
    expect(err.statusCode).toBe(502);
    expect(reasonOf(err).reason).toBe('llm_timeout');
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(s.store.replaces).toHaveLength(0);
  });

  it('deadline: an LLM that answers after the deadline is not stored', async () => {
    const s = setup({
      limits: { requestDeadlineMs: 60 },
      complete: async (req) => {
        await new Promise((r) => setTimeout(r, 120));
        return { data: GOOD, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '', attempts: 1 };
      },
    });
    const err = await rejection(s.service.generate('w', 'p1'));
    expect(reasonOf(err).reason).toBe('llm_timeout');
    await new Promise((r) => setTimeout(r, 150));
    expect(s.store.replaces).toHaveLength(0);
  });

  it('the LLM timeout is the remainder of the deadline, capped by the LLM limit', async () => {
    const s = setup({ limits: { requestDeadlineMs: 5_000, llmMs: 60_000 } });
    await s.service.generate('w', 'p1');
    const timeout = (s.complete.mock.calls[0]![0] as StructuredRequest<unknown>).timeoutMs!;
    expect(timeout).toBeLessThanOrEqual(5_000);
    expect(timeout).toBeGreaterThan(0);

    const s2 = setup({ limits: { requestDeadlineMs: 120_000, llmMs: 2_000 } });
    await s2.service.generate('w', 'p1');
    expect((s2.complete.mock.calls[0]![0] as StructuredRequest<unknown>).timeoutMs).toBe(2_000);
  });
});

describe('BriefService restart (EC-24)', () => {
  it('a fresh service over the same store reads the stored brief, generates again, and an abandoned run left no row', async () => {
    const store = new Store();
    const first = setup({ store });
    await first.service.generate('w', 'p1');
    const stored = store.doc;
    expect(stored).not.toBeNull();

    // a generation in the old instance abandoned by its deadline
    const abandoned = setup({
      store,
      limits: { requestDeadlineMs: 40 },
      complete: async (req) => {
        await new Promise((r) => setTimeout(r, 90));
        return { data: GOOD, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '', attempts: 1 };
      },
    });
    expect(reasonOf(await rejection(abandoned.service.generate('w', 'p1'))).reason).toBe('llm_timeout');
    await new Promise((r) => setTimeout(r, 120));
    expect(store.replaces).toHaveLength(1);
    expect(store.doc).toBe(stored);

    // "restart": brand new instance, empty in-memory single-flight / rate-limit state
    const fresh = setup({ store });
    expect((await fresh.service.getBrief('w', 'p1'))?.summary).toBe('Adds things.');
    await expect(fresh.service.generate('w', 'p1')).resolves.toMatchObject({ pr_id: 'p1' });
    expect(store.replaces).toHaveLength(2);
  });
});
