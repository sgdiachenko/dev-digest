import { describe, it, expect } from 'vitest';
import { decideAvailability, toIndexInfo } from '../src/modules/onboarding/facts/availability.js';

const idx = { lastIndexedSha: 'a'.repeat(40), status: 'full' as const, filesIndexed: 12 };

describe('onboarding facts: availability (T14)', () => {
  it('not_cloned wins over everything', () => {
    expect(decideAvailability({ hasClone: false, index: idx, treeReadable: true })).toBe('not_cloned');
  });

  it('not_indexed without an index, an index SHA, or a readable tree', () => {
    expect(decideAvailability({ hasClone: true, index: null, treeReadable: true })).toBe('not_indexed');
    expect(decideAvailability({ hasClone: true, index: { ...idx, lastIndexedSha: '' }, treeReadable: true })).toBe('not_indexed');
    expect(decideAvailability({ hasClone: true, index: idx, treeReadable: false })).toBe('not_indexed');
  });

  it('a failed index that completed once stays available (EC-5)', () => {
    expect(decideAvailability({ hasClone: true, index: { ...idx, status: 'failed' }, treeReadable: true })).toBe('available');
  });

  it('toIndexInfo maps the index state and the tour counters', () => {
    expect(
      toIndexInfo({ index: { ...idx, status: 'partial', reason: 'time budget' }, filesInRepo: 40, graphAvailable: true, skipped: 2 }),
    ).toEqual({
      status: 'partial',
      reason: 'time budget',
      files_indexed: 12,
      files_in_repo: 40,
      graph_available: true,
      files_skipped_by_tour: 2,
    });
    expect(toIndexInfo({ index: null, filesInRepo: null, graphAvailable: false, skipped: 0 })).toMatchObject({
      status: 'failed',
      reason: 'no_index',
      files_indexed: 0,
      files_in_repo: null,
    });
  });
});
