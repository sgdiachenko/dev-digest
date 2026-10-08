import { describe, it, expect } from 'vitest';
import {
  findDuplicates,
  formatContextLine,
  orderRunCandidates,
  planInjection,
  touchedByDiff,
} from '../src/modules/context-attachments/helpers.js';

describe('orderRunCandidates (AC-19, EC-17)', () => {
  it('own first in saved order, then skills in order; a duplicate keeps only its first position', () => {
    const out = orderRunCandidates(
      ['a.md', 'b.md'],
      [
        { name: 'S1', paths: ['c.md', 'a.md'] },
        { name: 'S2', paths: ['c.md', 'd.md'] },
      ],
    );
    expect(out.map((c) => [c.path, c.source, c.skillName, c.duplicate])).toEqual([
      ['a.md', 'agent', null, false],
      ['b.md', 'agent', null, false],
      ['c.md', 'skill', 'S1', false],
      ['a.md', 'skill', 'S1', true],
      ['c.md', 'skill', 'S2', true],
      ['d.md', 'skill', 'S2', false],
    ]);
  });

  it('is empty without any attachment', () => {
    expect(orderRunCandidates([], [{ name: 'S', paths: [] }])).toEqual([]);
  });
});

describe('planInjection (AC-12, AC-14, AC-22)', () => {
  it('skips a whole over-budget document and continues with the next one (greedy)', () => {
    const plan = planInjection([{ estTokens: 600 }, { estTokens: 500 }, { estTokens: 300 }, { estTokens: 100 }], 1000);
    expect(plan.would_skip).toEqual([null, 'over_budget', null, null]);
    expect(plan.total).toBe(1000);
  });

  it('never counts ineligible items and treats a null estimate as free', () => {
    const plan = planInjection(
      [{ estTokens: 900, eligible: false }, { estTokens: null }, { estTokens: 1000 }, { estTokens: 1 }],
      1000,
    );
    expect(plan.would_skip).toEqual([null, null, null, 'over_budget']);
    expect(plan.total).toBe(1000);
  });

  it('an item larger than the whole budget is skipped, total stays 0', () => {
    expect(planInjection([{ estTokens: 5000 }], 1000)).toEqual({ total: 0, would_skip: ['over_budget'] });
  });
});

describe('findDuplicates (AC-8)', () => {
  it('reports each repeated (repo, path) once; same path in another repo is not a duplicate', () => {
    const dupes = findDuplicates([
      { repoId: 'r1', path: 'a.md' },
      { repoId: 'r2', path: 'a.md' },
      { repoId: 'r1', path: 'a.md' },
      { repoId: 'r1', path: 'a.md' },
    ]);
    expect(dupes).toEqual([{ repoId: 'r1', path: 'a.md' }]);
  });

  it('is empty for a unique list', () => {
    expect(findDuplicates([{ repoId: 'r1', path: 'a.md' }, { repoId: 'r1', path: 'b.md' }])).toEqual([]);
  });
});

describe('touchedByDiff (AC-28)', () => {
  it('returns the injected paths the diff also changes, in injected order', () => {
    expect(touchedByDiff(['src/x.ts', 'b.md', 'a.md'], ['a.md', 'c.md', 'b.md'])).toEqual(['a.md', 'b.md']);
  });

  it('is empty when nothing overlaps', () => {
    expect(touchedByDiff(['x.ts'], ['a.md'])).toEqual([]);
  });
});

describe('formatContextLine (AC-27)', () => {
  it('plain line without skips or repeats', () => {
    expect(formatContextLine({ n: 3, tokens: 1200, skipped: {}, calls: 1 })).toBe(
      'Project context: 3 docs, ≈1200 tokens',
    );
  });

  it('appends "× N calls" only when the engine makes more than one call', () => {
    expect(formatContextLine({ n: 2, tokens: 10, skipped: {}, calls: 4 })).toBe(
      'Project context: 2 docs, ≈10 tokens × 4 calls',
    );
  });

  it('appends the skipped count with per-reason counts, zero reasons omitted', () => {
    expect(
      formatContextLine({ n: 1, tokens: 50, skipped: { over_budget: 1, missing: 2, too_large: 0 }, calls: 2 }),
    ).toBe('Project context: 1 docs, ≈50 tokens × 2 calls, skipped 3 (missing: 2, over_budget: 1)');
  });
});
