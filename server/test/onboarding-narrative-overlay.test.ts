import { describe, it, expect } from 'vitest';
import {
  estimateCost,
  needsPersistInterrupted,
  toNarrativeView,
} from '../src/modules/onboarding/narrative/overlay.js';
import type { StoredNarrativeState } from '../src/modules/onboarding/narrative/types.js';

const now = new Date('2026-10-01T12:00:00.000Z');
const narrative: NonNullable<StoredNarrativeState['narrative']> = {
  generation_id: 'g1',
  source_sha: 'sha1',
  generated_at: '2026-10-01T11:00:00.000Z',
  provider: 'openrouter',
  model: 'm',
  input_tokens: 1,
  output_tokens: 2,
  cost_usd: 0.1,
  last_failure: null,
  fallback_sections: [],
  sections: {
    architecture: { body_markdown: 'b', diagram_mermaid: null },
    critical_paths: null,
    run_locally: null,
    reading_path: null,
    first_tasks: null,
  },
};
const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString();
const yes = (): boolean => true;
const no = (): boolean => false;

describe('toNarrativeView', () => {
  it('returns null with nothing stored', () => {
    expect(toNarrativeView({ narrative: null, generation: null }, 'sha1', now, yes)).toBeNull();
  });

  it('computes outdated per request from source_sha', () => {
    const s: StoredNarrativeState = {
      narrative: { ...narrative },
      generation: { id: 'g1', status: 'ready', started_at: ago(1000), last_failure: null },
    };
    expect(toNarrativeView(s, 'sha1', now, yes)!.outdated).toBe(false);
    expect(toNarrativeView(s, 'sha2', now, yes)!.outdated).toBe(true);
    expect(toNarrativeView(s, 'sha2', now, yes)!.status).toBe('ready');
  });

  it('a failed latest generation keeps the previous narrative', () => {
    const failure = { reason: 'llm_timeout' as const, at: ago(10), provider: null, model: null };
    const v = toNarrativeView(
      {
        narrative: { ...narrative },
        generation: { id: 'g2', status: 'failed', started_at: ago(100), last_failure: failure },
      },
      'sha1',
      now,
      no,
    )!;
    expect(v.status).toBe('failed');
    expect(v.last_failure).toEqual(failure);
    expect(v.sections.architecture).not.toBeNull();
    expect(v.generation_id).toBe('g2');
  });

  it('generating and not in flight is interrupted', () => {
    const s: StoredNarrativeState = {
      narrative: { ...narrative },
      generation: { id: 'g2', status: 'generating', started_at: ago(1000), last_failure: null },
    };
    expect(needsPersistInterrupted(s, now, no)).toBe(true);
    const v = toNarrativeView(s, 'sha1', now, no)!;
    expect(v.status).toBe('failed');
    expect(v.last_failure!.reason).toBe('interrupted');
    expect(v.sections.architecture).not.toBeNull();
  });

  it('generating and in flight is generating until 90 s, then interrupted', () => {
    const mk = (ms: number): StoredNarrativeState => ({
      narrative: null,
      generation: { id: 'g3', status: 'generating', started_at: ago(ms), last_failure: null },
    });
    expect(needsPersistInterrupted(mk(89000), now, yes)).toBe(false);
    expect(toNarrativeView(mk(89000), 'sha1', now, yes)!.status).toBe('generating');
    expect(needsPersistInterrupted(mk(91000), now, yes)).toBe(true);
    const v = toNarrativeView(mk(91000), 'sha1', now, yes)!;
    expect(v.status).toBe('failed');
    expect(v.last_failure!.reason).toBe('interrupted');
  });

  it('a settled row is never flagged for persisting', () => {
    expect(
      needsPersistInterrupted(
        { narrative: null, generation: { id: 'g', status: 'failed', started_at: ago(1e9), last_failure: null } },
        now,
        no,
      ),
    ).toBe(false);
  });
});

describe('estimateCost', () => {
  it('prices a full input plus the output cap through the injected estimator', () => {
    const calls: Array<[string, number, number]> = [];
    const r = estimateCost('m', (m, i, o) => (calls.push([m, i, o]), 0.5));
    expect(r).toEqual({ model: 'm', approx_usd: 0.5 });
    expect(calls).toEqual([['m', 12000, 8000]]);
    expect(estimateCost('m', () => null).approx_usd).toBeNull();
  });
});
