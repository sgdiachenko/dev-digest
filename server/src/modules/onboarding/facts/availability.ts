import type {
  OnboardingAvailability,
  OnboardingIndexInfo,
  OnboardingIndexStatus,
} from '@devdigest/shared';

/** The slice of the repo-intel index state the tour needs (structural copy). */
export interface TourIndexState {
  lastIndexedSha: string;
  status: OnboardingIndexStatus;
  reason?: string | null;
  filesIndexed: number;
}

export interface AvailabilityInput {
  hasClone: boolean;
  index: TourIndexState | null;
  /** The tree at `index.lastIndexedSha` could be listed. */
  treeReadable: boolean;
}

/**
 * No clone → `not_cloned`. A clone without a completed index, or whose tree at
 * the index SHA cannot be read → `not_indexed`. A failed index that completed
 * once before keeps its last SHA and stays `available` (EC-5).
 */
export function decideAvailability(input: AvailabilityInput): OnboardingAvailability {
  if (!input.hasClone) return 'not_cloned';
  if (input.index === null || input.index.lastIndexedSha === '' || !input.treeReadable) return 'not_indexed';
  return 'available';
}

export interface IndexInfoInput {
  index: TourIndexState | null;
  filesInRepo: number | null;
  graphAvailable: boolean;
  skipped: number;
}

/** Wire `index` block; with no index it reports a `failed` status and no files. */
export function toIndexInfo(input: IndexInfoInput): OnboardingIndexInfo {
  const { index } = input;
  return {
    status: index?.status ?? 'failed',
    reason: index ? (index.reason ?? null) : 'no_index',
    files_indexed: index?.filesIndexed ?? 0,
    files_in_repo: input.filesInRepo,
    graph_available: input.graphAvailable,
    files_skipped_by_tour: input.skipped,
  };
}
