/**
 * PR-list rules, unit-tested.
 *
 * These lived inline in `pulls/routes.ts` until the module was split, where the
 * only way to exercise them was an HTTP round-trip against a seeded Postgres.
 * They are pure functions now, so each rule gets a direct test — including one
 * that has already caused a real bug (see INSIGHTS.md): cost `null` never
 * rendering as $0.00. (`reviewIdsForFindings`'s round-vs-latest split now lives
 * in `_shared/review-rounds.ts`, tested by shared-review-rounds.test.ts.)
 */
import { describe, it, expect } from 'vitest';
import {
  costByPr,
  findingsSummaryByPr,
  latestReviewByPr,
  needsDiffStatBackfill,
  rowToPrMeta,
} from '../src/modules/pulls/helpers.js';
import type { ReviewLite } from '../src/modules/_shared/review-rounds.js';
import type { Pull } from '../src/modules/pulls/repository.js';

const T0 = new Date('2026-09-17T12:00:00.000Z');
const ms = (offset: number) => new Date(T0.getTime() + offset);

function review(o: Partial<ReviewLite> = {}): ReviewLite {
  return { id: 'rev-1', prId: 'pr-1', runId: null, score: 80, createdAt: T0, ...o };
}

function pull(o: Partial<Pull> = {}): Pull {
  return {
    id: 'pr-1',
    repoId: 'repo-1',
    number: 42,
    title: 'Add rate limiting',
    author: 'octocat',
    branch: 'feat/rate-limit',
    base: 'main',
    headSha: 'abc1234',
    additions: 10,
    deletions: 2,
    filesCount: 3,
    status: 'open',
    lastReviewedSha: null,
    openedAt: T0,
    updatedAt: T0,
    body: null,
    ...o,
  };
}

describe('latestReviewByPr', () => {
  it('keeps the first row seen per PR (caller supplies newest-first)', () => {
    const map = latestReviewByPr([
      review({ id: 'newest', createdAt: ms(1000) }),
      review({ id: 'older', createdAt: ms(0) }),
    ]);
    expect(map.get('pr-1')?.id).toBe('newest');
  });

  it('keeps PRs apart', () => {
    const map = latestReviewByPr([
      review({ id: 'a', prId: 'pr-1' }),
      review({ id: 'b', prId: 'pr-2' }),
    ]);
    expect(map.get('pr-1')?.id).toBe('a');
    expect(map.get('pr-2')?.id).toBe('b');
  });
});

describe('findingsSummaryByPr', () => {
  const finding = (o: Record<string, unknown>) =>
    ({
      id: 'f',
      reviewId: 'rev-1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded key',
      file: 'src/config.ts',
      startLine: 11,
      endLine: 11,
      rationale: 'why',
      suggestion: null,
      confidence: 0.9,
      kind: 'finding',
      trifectaComponents: null,
      acceptedAt: null,
      dismissedAt: null,
      ...o,
    }) as never;

  it('folds several reviews of one PR into a single summary', () => {
    const ids = new Map([['pr-1', ['rev-1', 'rev-2']]]);
    const summary = findingsSummaryByPr(ids, [
      finding({ id: 'f1', reviewId: 'rev-1', severity: 'CRITICAL' }),
      finding({ id: 'f2', reviewId: 'rev-2', severity: 'WARNING' }),
    ]).get('pr-1');
    expect(summary?.counts.CRITICAL).toBe(1);
    expect(summary?.counts.WARNING).toBe(1);
  });

  it('excludes dismissed findings from the counts', () => {
    const ids = new Map([['pr-1', ['rev-1']]]);
    const summary = findingsSummaryByPr(ids, [
      finding({ id: 'f1', severity: 'CRITICAL' }),
      finding({ id: 'f2', severity: 'CRITICAL', dismissedAt: T0 }),
    ]).get('pr-1');
    expect(summary?.counts.CRITICAL).toBe(1);
  });
});

describe('costByPr', () => {
  it('sums cost across runs', () => {
    const map = costByPr([
      { prId: 'pr-1', costUsd: 0.001 },
      { prId: 'pr-1', costUsd: 0.002 },
    ]);
    expect(map.get('pr-1')?.sum).toBeCloseTo(0.003);
    expect(map.get('pr-1')?.hasCost).toBe(true);
  });

  it('distinguishes "no cost captured" from "cost was zero"', () => {
    // Pre-migration rows carry costUsd = null. That must stay "we don't know",
    // never $0.00 — hence hasCost tracked apart from the numeric sum.
    const unknown = costByPr([{ prId: 'pr-1', costUsd: null }]).get('pr-1');
    expect(unknown).toEqual({ sum: 0, hasCost: false });

    const free = costByPr([{ prId: 'pr-1', costUsd: 0 }]).get('pr-1');
    expect(free).toEqual({ sum: 0, hasCost: true });
  });

  it('ignores runs not attached to a PR', () => {
    expect(costByPr([{ prId: null, costUsd: 1 }]).size).toBe(0);
  });
});

describe('rowToPrMeta', () => {
  const opts = { score: null, cost: undefined, findings: null, now: T0.getTime() };

  it('renders an unknown cost as null, not 0', () => {
    const meta = rowToPrMeta(pull(), { ...opts, cost: { sum: 0, hasCost: false } });
    expect(meta.cost_usd).toBeNull();
  });

  it('renders a genuinely free run as 0', () => {
    const meta = rowToPrMeta(pull(), { ...opts, cost: { sum: 0, hasCost: true } });
    expect(meta.cost_usd).toBe(0);
  });

  it('maps the row onto the snake_case wire shape', () => {
    const meta = rowToPrMeta(pull({ headSha: 'deadbee', filesCount: 7 }), opts);
    expect(meta.head_sha).toBe('deadbee');
    expect(meta.files_count).toBe(7);
    expect(meta.opened_at).toBe(T0.toISOString());
  });
});

describe('needsDiffStatBackfill', () => {
  it('is true only when every diff stat is zero (GitHub list payload omits them)', () => {
    expect(needsDiffStatBackfill(pull({ additions: 0, deletions: 0, filesCount: 0 }))).toBe(true);
    expect(needsDiffStatBackfill(pull({ additions: 1, deletions: 0, filesCount: 0 }))).toBe(false);
    expect(needsDiffStatBackfill(pull())).toBe(false);
  });
});
