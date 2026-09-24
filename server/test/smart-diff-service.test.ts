/**
 * `SmartDiffService`, unit-tested against a fake `SmartDiffStore` — no DB.
 */
import { describe, it, expect, vi } from 'vitest';
import { SmartDiffService, type SmartDiffStore } from '../src/modules/smart-diff/service.js';
import type { SmartDiffFileInput, SmartDiffFindingInput } from '../src/modules/smart-diff/helpers.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { ReviewLite, RunLite } from '../src/modules/_shared/review-rounds.js';

const T0 = new Date('2026-09-17T12:00:00.000Z');
const ms = (offset: number) => new Date(T0.getTime() + offset);

function review(o: Partial<ReviewLite> = {}): ReviewLite {
  return { id: 'rev-1', prId: 'pr-1', runId: 'run-1', score: 80, createdAt: T0, ...o };
}

function run(o: Partial<RunLite> = {}): RunLite {
  return { id: 'run-1', prId: 'pr-1', ranAt: T0, ...o };
}

function finding(o: Partial<SmartDiffFindingInput> = {}): SmartDiffFindingInput {
  return { id: 'f1', file: 'src/config.ts', startLine: 11, dismissedAt: null, ...o };
}

interface Fixture {
  pull?: { id: string } | undefined;
  files?: SmartDiffFileInput[];
  reviews?: ReviewLite[];
  runs?: RunLite[];
  findings?: SmartDiffFindingInput[];
}

function makeStore(fx: Fixture = {}): SmartDiffStore & { listFindingsForReviews: ReturnType<typeof vi.fn> } {
  const listFindingsForReviews = vi.fn(async (_ids: string[]) => fx.findings ?? []);
  return {
    findPull: async () => fx.pull,
    listFiles: async () => fx.files ?? [],
    listReviewsForPulls: async () => fx.reviews ?? [],
    listRunsForPulls: async () => fx.runs ?? [],
    listFindingsForReviews,
  };
}

describe('SmartDiffService.getSmartDiff', () => {
  it('404s when the PR is not found', async () => {
    const store = makeStore({ pull: undefined });
    const service = new SmartDiffService(store);
    await expect(service.getSmartDiff('ws-1', 'pr-missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('no reviews yet: groups still come from the files, and findings are never fetched', async () => {
    const store = makeStore({
      pull: { id: 'pr-1' },
      files: [{ path: 'src/config.ts', additions: 4, deletions: 1 }],
      reviews: [],
      runs: [],
    });
    const service = new SmartDiffService(store);
    const diff = await service.getSmartDiff('ws-1', 'pr-1');
    expect(diff.groups).toHaveLength(1);
    expect(diff.groups[0]!.role).toBe('core');
    expect(diff.groups[0]!.files[0]!.finding_ids).toEqual([]);
    expect(store.listFindingsForReviews).not.toHaveBeenCalled();
  });

  it('takes only the latest round: an older, separate round is excluded', async () => {
    const store = makeStore({
      pull: { id: 'pr-1' },
      files: [{ path: 'src/config.ts', additions: 4, deletions: 1 }],
      // Two agents from the SAME "review all" click (well inside ROUND_WINDOW_MS).
      runs: [run({ id: 'run-latest-a', ranAt: T0 }), run({ id: 'run-latest-b', ranAt: ms(2_000) })],
      reviews: [
        review({ id: 'rev-latest-a', runId: 'run-latest-a', createdAt: T0 }),
        review({ id: 'rev-latest-b', runId: 'run-latest-b', createdAt: ms(2_000) }),
      ],
      findings: [finding({ id: 'f-latest' })],
    });
    const service = new SmartDiffService(store);
    await service.getSmartDiff('ws-1', 'pr-1');
    expect(store.listFindingsForReviews).toHaveBeenCalledTimes(1);
    const calledWith = store.listFindingsForReviews.mock.calls[0]![0] as string[];
    expect(new Set(calledWith)).toEqual(new Set(['rev-latest-a', 'rev-latest-b']));
  });

  it('fallback without runs: the single latest review by created_at is used', async () => {
    const store = makeStore({
      pull: { id: 'pr-1' },
      files: [{ path: 'src/config.ts', additions: 4, deletions: 1 }],
      runs: [], // hand-seeded review, no agent_runs row
      reviews: [
        review({ id: 'rev-older', createdAt: ms(-10_000) }),
        review({ id: 'rev-newest', createdAt: T0 }),
      ],
      findings: [finding({ id: 'f-newest', file: 'src/config.ts' })],
    });
    const service = new SmartDiffService(store);
    const diff = await service.getSmartDiff('ws-1', 'pr-1');
    expect(store.listFindingsForReviews).toHaveBeenCalledWith(['rev-newest']);
    expect(diff.groups[0]!.files[0]!.finding_ids).toEqual(['f-newest']);
  });
});
