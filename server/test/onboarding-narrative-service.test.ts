import { describe, it, expect, vi } from 'vitest';
import type { FeatureModelChoice, LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import {
  OnboardingNarrativeService,
  classifyFailure,
} from '../src/modules/onboarding/narrative-service.js';
import type { StoredNarrativeState } from '../src/modules/onboarding/narrative/types.js';
import type { NarrativeModelOutput } from '../src/modules/onboarding/narrative/output-schema.js';
import type { TourFacts, TourRepo } from '../src/modules/onboarding/types.js';
import { ConfigError, NotFoundError } from '../src/platform/errors.js';
import { TimeoutError } from '../src/platform/resilience.js';

const SHA = 'a'.repeat(40);
const REPO: TourRepo = { id: 'r1', workspaceId: 'w1', owner: 'acme', name: 'app', clonePath: '/c' };
const CHOICE: FeatureModelChoice = { provider: 'openrouter', model: 'm/x' };
const NOW = new Date('2026-10-01T00:00:00.000Z');

const facts = (over: Partial<TourFacts> = {}): TourFacts =>
  ({
    repoId: 'r1',
    availability: 'available',
    source_sha: SHA,
    sections: {
      architecture: { stack: [], modules: [] },
      critical_paths: { items: [{ path: 'src/index.ts', tags: [] }] },
      run_locally: { groups: [{ package_path: '.', commands: [{ id: 'c1', command: 'pnpm test', phase: 'test' }] }] },
      reading_path: { items: [{ path: 'src/index.ts', reason: 'entry_point' }] },
      first_tasks: { items: [] },
    },
    treeIndex: new Map([['src/index.ts', { oid: '1'.repeat(40), size: 10, kind: 'blob' as const }]]),
    ...over,
  }) as unknown as TourFacts;

const GOOD: NarrativeModelOutput = {
  architecture: null,
  critical_paths: [{ path: 'src/index.ts', description: 'Entry point of the app' }],
  run_locally: null,
  reading_path: null,
  first_tasks: null,
};

class Store {
  state: StoredNarrativeState | null = null;
  writes: StoredNarrativeState[] = [];
  writeResult: 'ok' | 'repo_gone' = 'ok';
  repo: TourRepo | null = REPO;
  async read() {
    return this.state;
  }
  async write(_id: string, s: StoredNarrativeState) {
    this.writes.push(s);
    if (this.writeResult === 'ok') this.state = s;
    return this.writeResult;
  }
  async getRepo() {
    return this.repo;
  }
}

function setup(
  opts: {
    store?: Store;
    facts?: TourFacts | Error;
    complete?: (req: StructuredRequest<unknown>) => Promise<StructuredResult<unknown>>;
    llmError?: Error;
    now?: () => Date;
  } = {},
) {
  const store = opts.store ?? new Store();
  const complete = vi.fn(
    opts.complete ??
      (async (req: StructuredRequest<unknown>) => ({
        data: GOOD,
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.01,
        raw: '',
        attempts: 1,
      })),
  );
  const llm = { completeStructured: complete } as unknown as LLMProvider;
  const llmFor = vi.fn(async () => {
    if (opts.llmError) throw opts.llmError;
    return llm;
  });
  const readBlob = vi.fn(async () => new TextEncoder().encode('export {}'));
  const logs: object[] = [];
  const logger = { info: (o: object) => logs.push(o), warn: (o: object) => logs.push(o) };
  const service = new OnboardingNarrativeService(
    store,
    {
      getFacts: async () => {
        const f = opts.facts ?? facts();
        if (f instanceof Error) throw f;
        return f;
      },
    },
    { getRepoMap: async () => ({ text: 'SECRET-REPO-MAP', tokens: 1, cached: false }) },
    { readBlob },
    llmFor,
    async () => CHOICE,
    () => 0.5,
    (s) => s.length,
    (label, c) => `<untrusted label="${label}">${c}</untrusted>`,
    async () => 'SYSTEM',
    opts.now ?? (() => NOW),
  );
  return { service, store, complete, llmFor, readBlob, logs, logger };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('OnboardingNarrativeService.requestGeneration', () => {
  it('returns accepted without waiting for the LLM, writing generating first', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { service, store, complete } = setup({
      complete: async (req) => {
        await gate;
        return { data: GOOD, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: null, raw: '', attempts: 1 };
      },
    });
    const out = await service.requestGeneration('w1', 'r1');
    expect(out).toMatchObject({ kind: 'accepted', alreadyRunning: false });
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0]!.generation?.status).toBe('generating');
    await settle();
    expect(complete).toHaveBeenCalledTimes(1);
    release();
    await settle();
    expect(store.state!.generation?.status).toBe('ready');
  });

  it('makes exactly one completeStructured call with the C22 flags', async () => {
    const { service, complete } = setup();
    await service.requestGeneration('w1', 'r1');
    await settle();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]![0]).toMatchObject({
      maxRetries: 0,
      httpRetries: 0,
      timeoutMs: 60_000,
      requireStructuredProviders: true,
      maxTokens: 8000,
      model: 'm/x',
    });
  });

  it('persists the grounded narrative on success with provider, model, tokens and cost', async () => {
    const { service, store } = setup();
    await service.requestGeneration('w1', 'r1');
    await settle();
    const n = store.state!.narrative!;
    expect(n).toMatchObject({
      source_sha: SHA,
      provider: 'openrouter',
      model: 'm/x',
      input_tokens: 10,
      output_tokens: 5,
      cost_usd: 0.01,
    });
    expect(n.sections.critical_paths).toEqual([{ path: 'src/index.ts', description: 'Entry point of the app' }]);
    expect(n.fallback_sections).toContain('architecture');
    expect(store.state!.generation).toMatchObject({ status: 'ready', last_failure: null });
  });

  it('single-flight: a second request while running shares the id and makes no second call', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { service, complete } = setup({
      complete: async (req) => {
        await gate;
        return { data: GOOD, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: null, raw: '', attempts: 1 };
      },
    });
    const a = await service.requestGeneration('w1', 'r1');
    const b = await service.requestGeneration('w1', 'r1');
    expect(a.kind).toBe('accepted');
    expect(b).toMatchObject({ kind: 'accepted', alreadyRunning: true, id: (a as { id: string }).id });
    release();
    await settle();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('rate-limits the 11th request in a minute per workspace', async () => {
    const { service } = setup();
    for (let i = 0; i < 10; i++) {
      const out = await service.requestGeneration('w1', 'r1');
      expect(out.kind).toBe('accepted');
      await settle();
    }
    expect(await service.requestGeneration('w1', 'r1')).toEqual({ kind: 'rate_limited' });
    // another workspace is unaffected
    expect((await service.requestGeneration('w2', 'r1')).kind).not.toBe('rate_limited');
  });

  it('not_found for a missing repo, unavailable for an unavailable tour; neither writes', async () => {
    const s1 = new Store();
    s1.repo = null;
    expect(await setup({ store: s1 }).service.requestGeneration('w1', 'r1')).toEqual({ kind: 'not_found' });
    expect(s1.writes).toHaveLength(0);

    const s2 = new Store();
    const out = await setup({
      store: s2,
      facts: facts({ availability: 'not_indexed', source_sha: null, sections: null }),
    }).service.requestGeneration('w1', 'r1');
    expect(out).toEqual({ kind: 'unavailable' });
    expect(s2.writes).toHaveLength(0);
  });

  it('propagates a NotFoundError from the facts lookup', async () => {
    const { service } = setup({ facts: new NotFoundError('x') });
    await expect(service.requestGeneration('w1', 'r1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('repo_gone on the generating write -> not_found and no run', async () => {
    const store = new Store();
    store.writeResult = 'repo_gone';
    const { service, complete } = setup({ store });
    expect(await service.requestGeneration('w1', 'r1')).toEqual({ kind: 'not_found' });
    await settle();
    expect(complete).not.toHaveBeenCalled();
  });

  it('repo_gone on the final write stores nothing', async () => {
    const store = new Store();
    const { service } = setup({ store });
    await service.requestGeneration('w1', 'r1'); // generating written, run starts
    store.writeResult = 'repo_gone';
    await settle();
    expect(store.state!.generation?.status).toBe('generating'); // the ready write was refused
  });

  it('ConfigError -> missing_key without any LLM call, with provider/model set', async () => {
    const { service, store, complete } = setup({ llmError: new ConfigError('no key') });
    await service.requestGeneration('w1', 'r1');
    await settle();
    expect(complete).not.toHaveBeenCalled();
    expect(store.state!.generation).toMatchObject({
      status: 'failed',
      last_failure: { reason: 'missing_key', provider: 'openrouter', model: 'm/x' },
    });
  });

  it.each([
    ['timeout', new TimeoutError(60_000), 'llm_timeout'],
    ['provider', Object.assign(new Error('x'), { name: 'NoEligibleProviderError' }), 'no_structured_provider'],
    ['schema', new Error('OpenRouter structured output failed schema validation for X'), 'invalid_output'],
    ['other', new Error('boom'), 'llm_error'],
  ])('failure (%s) -> %s, keeping the previous narrative untouched', async (_n, error, reason) => {
    const store = new Store();
    const prior = {
      generation_id: 'old',
      source_sha: 'b'.repeat(40),
      generated_at: NOW.toISOString(),
      provider: 'p',
      model: 'm',
      input_tokens: 1,
      output_tokens: 1,
      cost_usd: null,
      last_failure: null,
      fallback_sections: [],
      sections: { architecture: null, critical_paths: null, run_locally: null, reading_path: null, first_tasks: null },
    } as const;
    store.state = { narrative: { ...prior, fallback_sections: [] }, generation: null };
    const { service } = setup({
      store,
      complete: async () => {
        throw error;
      },
    });
    await service.requestGeneration('w1', 'r1');
    await settle();
    expect(store.state!.narrative).toEqual(prior);
    expect(store.state!.generation).toMatchObject({
      status: 'failed',
      last_failure: { reason, provider: 'openrouter', model: 'm/x' },
    });
  });

  it('an all-null grounded output is invalid_output', async () => {
    const { service, store } = setup({
      complete: async (req) => ({
        data: { ...GOOD, critical_paths: [{ path: 'nope.ts', description: 'x' }] },
        model: req.model,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: null,
        raw: '',
        attempts: 1,
      }),
    });
    await service.requestGeneration('w1', 'r1');
    await settle();
    expect(store.state!.generation?.last_failure?.reason).toBe('invalid_output');
    expect(store.state!.narrative).toBeNull();
  });

  it('logs metadata only: no prompt, excerpt, repo map or model output', async () => {
    const { service, logs, logger } = setup();
    await service.requestGeneration('w1', 'r1', logger);
    await settle();
    expect(logs.length).toBeGreaterThan(0);
    const text = JSON.stringify(logs);
    expect(logs.some((l) => (l as { source_sha?: string }).source_sha === SHA)).toBe(true);
    for (const leak of ['SYSTEM', 'SECRET-REPO-MAP', 'export {}', 'Entry point of the app']) {
      expect(text).not.toContain(leak);
    }
  });
});

describe('OnboardingNarrativeService.forTour', () => {
  it('makes no LLM call and returns the estimate with no narrative when nothing is stored', async () => {
    const { service, complete, llmFor } = setup();
    const out = await service.forTour('w1', 'r1', SHA);
    expect(out.narrative).toBeNull();
    expect(out.estimated_cost).toEqual({ model: 'm/x', approx_usd: 0.5 });
    expect(complete).not.toHaveBeenCalled();
    expect(llmFor).not.toHaveBeenCalled();
  });

  it('turns a dead generating row into failed/interrupted, persisted once, with provider/model', async () => {
    const store = new Store();
    store.state = {
      narrative: null,
      generation: { id: 'g1', status: 'generating', started_at: NOW.toISOString(), last_failure: null },
    };
    const { service } = setup({ store }); // g1 is not in flight in this process
    const out = await service.forTour('w1', 'r1', SHA);
    expect(out.narrative).toMatchObject({ status: 'failed', last_failure: { reason: 'interrupted' } });
    expect(store.writes).toHaveLength(1);
    expect(store.state!.generation?.last_failure).toMatchObject({
      reason: 'interrupted',
      provider: 'openrouter',
      model: 'm/x',
    });
  });
});

describe('OnboardingNarrativeService interrupted recovery', () => {
  it('accepts a new generation after a dead generating row was marked interrupted', async () => {
    const store = new Store();
    store.state = {
      narrative: null,
      generation: { id: 'g1', status: 'generating', started_at: NOW.toISOString(), last_failure: null },
    };
    const { service, complete } = setup({ store });
    await service.forTour('w1', 'r1', SHA);
    expect(store.state!.generation).toMatchObject({ id: 'g1', status: 'failed' });
    const out = await service.requestGeneration('w1', 'r1');
    expect(out).toMatchObject({ kind: 'accepted', alreadyRunning: false });
    expect((out as { id: string }).id).not.toBe('g1');
    await settle();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(store.state!.generation).toMatchObject({ status: 'ready' });
  });
});

describe('classifyFailure', () => {
  it('maps by error name', () => {
    expect(classifyFailure(new ConfigError('x'))).toBe('missing_key');
    expect(classifyFailure(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe('llm_timeout');
    expect(classifyFailure('weird')).toBe('llm_error');
  });
});
