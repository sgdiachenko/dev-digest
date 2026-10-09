import { describe, it, expect } from 'vitest';
import type { EvalExpectation, Finding } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { aggregate, matches, scoreCase } from '../src/modules/eval/helpers.js';
import type { CaseOutcome } from '../src/modules/eval/types.js';

function fnd(file: string, start: number, end: number, kind?: Finding['kind']): Finding {
  return {
    id: `${file}:${start}`,
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file,
    start_line: start,
    end_line: end,
    rationale: 'r',
    confidence: 0.9,
    kind: kind ?? null,
  };
}
function exp(file: string, start: number, end: number): EvalExpectation {
  return { file, start_line: start, end_line: end, severity: null, category: null, title: null };
}
function outcome(over: Partial<CaseOutcome> = {}): CaseOutcome {
  return {
    type: 'must_find',
    status: 'pass',
    matched: 1,
    matches: ['matched'],
    expected_count: 1,
    actual_count: 1,
    dropped_count: 0,
    error_reason: null,
    cost_usd: null,
    duration_ms: null,
    ...over,
  };
}
const err = (over: Partial<CaseOutcome> = {}) =>
  outcome({ status: 'error', matched: 0, matches: [], actual_count: 0, error_reason: 'timeout', ...over });

describe('matches (AC-25, AC-26)', () => {
  const e = exp('a.ts', 10, 12);
  it('matches on the same file with intersecting inclusive ranges', () => {
    expect(matches(fnd('a.ts', 12, 15), e)).toBe(true);
    expect(matches(fnd('a.ts', 8, 10), e)).toBe(true);
  });
  it('does not match disjoint ranges or another file', () => {
    expect(matches(fnd('a.ts', 13, 14), e)).toBe(false);
    expect(matches(fnd('a.ts', 1, 9), e)).toBe(false);
    expect(matches(fnd('b.ts', 10, 12), e)).toBe(false);
  });
  it('full-file kinds match on the file alone (EC-5)', () => {
    expect(matches(fnd('a.ts', 99, 99, 'secret_leak'), e)).toBe(true);
    expect(matches(fnd('b.ts', 10, 12, 'secret_leak'), e)).toBe(false);
    expect(matches(fnd('a.ts', 99, 99, 'bug' as Finding['kind']), e)).toBe(false);
  });
});

describe('scoreCase', () => {
  it('must_find passes only when every expectation is matched (AC-27)', () => {
    const exps = [exp('a.ts', 1, 2), exp('a.ts', 10, 12)];
    const one = scoreCase('must_find', exps, [fnd('a.ts', 1, 1)], []);
    expect(one.status).toBe('fail');
    expect(one.matched).toBe(1);
    const both = scoreCase('must_find', exps, [fnd('a.ts', 1, 1), fnd('a.ts', 11, 11)], []);
    expect(both.status).toBe('pass');
    expect(both.matches).toEqual(['matched', 'matched']);
  });

  it('must_not_flag fails on a forbidden-range hit, passes otherwise (AC-28)', () => {
    const exps = [exp('a.ts', 10, 12)];
    const hit = scoreCase('must_not_flag', exps, [fnd('a.ts', 11, 11)], []);
    expect(hit.status).toBe('fail');
    expect(hit.matches).toEqual(['forbidden_hit']);
    const clean = scoreCase('must_not_flag', exps, [fnd('a.ts', 40, 41)], []);
    expect(clean.status).toBe('pass');
    expect(clean.matches).toEqual(['unmatched']);
  });

  it('an errored case is never pass (AC-171)', () => {
    const r = scoreCase('must_not_flag', [exp('a.ts', 1, 1)], [], [], 'timeout');
    expect(r.status).toBe('error');
    expect(r.error_reason).toBe('timeout');
    expect(scoreCase('must_find', [], [], []).status).toBe('fail');
  });

  it('reports counts', () => {
    const r = scoreCase('must_find', [exp('a.ts', 1, 1)], [fnd('a.ts', 1, 1)], [{}, {}]);
    expect([r.expected_count, r.actual_count, r.dropped_count]).toEqual([1, 1, 2]);
  });
});

describe('aggregate', () => {
  it('recall = matched must_find expectations / all must_find expectations (AC-29)', () => {
    const a = aggregate([
      outcome({ expected_count: 2, matched: 2, matches: ['matched', 'matched'], actual_count: 2 }),
      outcome({ status: 'fail', expected_count: 2, matched: 1, matches: ['matched'], actual_count: 1 }),
    ]);
    expect(a.recall).toBe(3 / 4);
  });

  it('precision counts unlabelled kept findings as noise (AC-30, EC-31)', () => {
    const a = aggregate([
      outcome({
        expected_count: 2,
        matched: 2,
        matches: ['matched', 'matched', 'unmatched', 'unmatched', 'unmatched'],
        actual_count: 5,
      }),
    ]);
    expect(a.precision).toBe(2 / 5);
  });

  it('citation accuracy = kept / (kept + dropped) (AC-31, EC-25)', () => {
    const a = aggregate([outcome({ actual_count: 3, dropped_count: 1, matches: ['matched'] })]);
    expect(a.citation_accuracy).toBe(3 / 4);
  });

  it('cases_passed counts passes among non-errored cases (AC-32)', () => {
    const a = aggregate([outcome(), outcome({ status: 'fail' }), err()]);
    expect(a.cases_passed).toBe(1);
    expect(a.cases_completed).toBe(2);
  });

  it('null on a zero denominator (AC-33, EC-19)', () => {
    const noMust = aggregate([
      outcome({ type: 'must_not_flag', expected_count: 1, matched: 0, matches: [], actual_count: 0 }),
    ]);
    expect(noMust.recall).toBeNull();
    expect(noMust.precision).toBeNull();
    expect(noMust.citation_accuracy).toBeNull();
    expect(noMust.cases_passed).toBe(1);
  });

  it('errored cases are excluded from every metric (AC-172)', () => {
    const base = aggregate([outcome()]);
    const withErr = aggregate([outcome(), err({ expected_count: 5, dropped_count: 9 })]);
    expect(withErr.recall).toBe(base.recall);
    expect(withErr.precision).toBe(base.precision);
    expect(withErr.citation_accuracy).toBe(base.citation_accuracy);
  });

  it('partial when some cases error, failed with null metrics when all do (AC-78, AC-79, EC-17)', () => {
    const partial = aggregate([outcome(), outcome(), err()]);
    expect(partial.status).toBe('partial');
    expect(partial.cases_errored).toBe(1);
    const failed = aggregate([err(), err()]);
    expect(failed.status).toBe('failed');
    expect(failed.cases_errored).toBe(2);
    expect([failed.recall, failed.precision, failed.citation_accuracy, failed.cases_passed]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(aggregate([outcome()]).status).toBe('completed');
  });

  it('cost is null when no case reported one, never 0 (AC-90)', () => {
    expect(aggregate([outcome(), outcome()]).cost_usd).toBeNull();
    expect(aggregate([outcome({ cost_usd: 0.25 }), outcome()]).cost_usd).toBe(0.25);
  });
});

describe('no LLM during scoring (AC-34, AC-138, NFR-4)', () => {
  it('scoreCase and aggregate never call the provider', () => {
    const spy = new MockLLMProvider();
    const kept = [fnd('a.ts', 1, 2)];
    const s = scoreCase('must_find', [exp('a.ts', 1, 1)], kept, []);
    aggregate([{ ...s, type: 'must_find', cost_usd: null, duration_ms: null }]);
    expect(spy.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);
    expect(spy.calls).toHaveLength(0);
  });
});

describe('performance (NFR-2)', () => {
  it('scores and aggregates 200 cases in under 100 ms', () => {
    const exps = Array.from({ length: 5 }, (_, i) => exp('a.ts', i * 10 + 1, i * 10 + 5));
    const kept = Array.from({ length: 20 }, (_, i) => fnd('a.ts', i * 3 + 1, i * 3 + 2));
    const t0 = performance.now();
    const outs: CaseOutcome[] = [];
    for (let i = 0; i < 200; i++) {
      outs.push({ ...scoreCase('must_find', exps, kept, []), type: 'must_find', cost_usd: 0.01, duration_ms: 5 });
    }
    const agg = aggregate(outs);
    expect(performance.now() - t0).toBeLessThan(100);
    expect(agg.cases_total).toBe(200);
  });
});
