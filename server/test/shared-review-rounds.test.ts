/**
 * `reviewIdsForFindings` — shared by `pulls` (findings_summary) and
 * `smart-diff` (finding_ids per file). Moved out of `pulls/helpers.ts` into
 * `_shared` so neither module imports the other's files; see server/INSIGHTS.md.
 */
import { describe, it, expect } from 'vitest';
import {
  reviewIdsForFindings,
  type ReviewLite,
  type RunLite,
} from '../src/modules/_shared/review-rounds.js';

const T0 = new Date('2026-09-17T12:00:00.000Z');
const ms = (offset: number) => new Date(T0.getTime() + offset);

function review(o: Partial<ReviewLite> = {}): ReviewLite {
  return { id: 'rev-1', prId: 'pr-1', runId: null, score: 80, createdAt: T0, ...o };
}

function run(o: Partial<RunLite> = {}): RunLite {
  return { id: 'run-1', prId: 'pr-1', ranAt: T0, ...o };
}

describe('reviewIdsForFindings', () => {
  it('SUMS every agent in the latest round, not just the newest review', () => {
    // One "Review all" click: two runs milliseconds apart, whose reviews finish
    // seconds apart because each agent's LLM call returns at its own pace.
    const runs = [run({ id: 'run-a' }), run({ id: 'run-b', ranAt: ms(200) })];
    const reviews = [
      review({ id: 'rev-b', runId: 'run-b', createdAt: ms(9000) }),
      review({ id: 'rev-a', runId: 'run-a', createdAt: ms(3000) }),
    ];
    const ids = reviewIdsForFindings(['pr-1'], runs, reviews);
    expect(new Set(ids.get('pr-1'))).toEqual(new Set(['rev-a', 'rev-b']));
  });

  it('excludes an older, separate round', () => {
    const runs = [
      run({ id: 'old', ranAt: ms(0) }),
      run({ id: 'new', ranAt: ms(60 * 60 * 1000) }), // an hour later — another click
    ];
    const reviews = [
      review({ id: 'rev-old', runId: 'old', createdAt: ms(0) }),
      review({ id: 'rev-new', runId: 'new', createdAt: ms(60 * 60 * 1000) }),
    ];
    expect(reviewIdsForFindings(['pr-1'], runs, reviews).get('pr-1')).toEqual(['rev-new']);
  });

  it('falls back to the single latest review when the PR has no runs (seeded data)', () => {
    const reviews = [
      review({ id: 'rev-older', createdAt: ms(0) }),
      review({ id: 'rev-newer', createdAt: ms(5000) }),
    ];
    expect(reviewIdsForFindings(['pr-1'], [], reviews).get('pr-1')).toEqual(['rev-newer']);
  });

  it('yields nothing for a PR with no reviews at all', () => {
    expect(reviewIdsForFindings(['pr-1'], [], []).has('pr-1')).toBe(false);
  });
});
