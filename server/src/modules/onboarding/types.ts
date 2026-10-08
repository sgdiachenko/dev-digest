/**
 * onboarding ports and domain types.
 *
 *   - `TourRepoStore` — persistence port implemented by repository.ts.
 *   - `TourIndex` / `TourGit` — the narrow slices of repo-intel and the git
 *     adapter the service reads; never the container.
 *   - `NarrativeStore` — persistence port for the AI narrative state (same repository).
 *   - `TourOverlay` — seam for the AI narrative: the facts service asks it for
 *     the narrative block on every request and never caches the answer.
 */
import type {
  GitClient,
  OnboardingAvailability,
  OnboardingEstimatedCost,
  OnboardingIndexInfo,
  OnboardingNarrative,
  OnboardingSections,
} from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';
import type { StoredNarrativeState } from './narrative/types.js';

export interface TourRepo {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

export interface TourRepoStore {
  /** Workspace-scoped; null when the repo does not exist in that workspace. */
  getRepo(workspaceId: string, repoId: string): Promise<TourRepo | null>;
}

export type TourIndex = Pick<RepoIntel, 'getIndexState' | 'getGraphFacts'>;
export type TourGit = Pick<GitClient, 'listTree' | 'readBlob' | 'grepAt'>;

/** pino-compatible subset. Receives metadata only, never file text. */
export interface TourLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

export interface TourTreeIndexEntry {
  oid: string;
  size: number | null;
  kind: 'blob' | 'tree' | 'commit';
}

/** Deterministic facts of one repo at one indexed SHA — the only thing the LRU caches. */
export interface TourFacts {
  repoId: string;
  index: OnboardingIndexInfo;
  availability: OnboardingAvailability;
  /** null unless `availability === 'available'`. */
  source_sha: string | null;
  computed_at: string;
  /** null unless `availability === 'available'`. */
  sections: OnboardingSections | null;
  /** Every git-tree entry at `source_sha` by path; empty when unavailable. */
  treeIndex: ReadonlyMap<string, TourTreeIndexEntry>;
}

export interface TourOverlayResult {
  narrative: OnboardingNarrative | null;
  estimated_cost: OnboardingEstimatedCost | null;
}

export interface TourOverlay {
  /** One storage read plus a synchronous estimate; never an LLM call, never cached by the caller. */
  forTour(workspaceId: string, repoId: string, factsSha: string | null): Promise<TourOverlayResult>;
}

/** Persistence of the narrative state (`onboarding.json`); one row per repo. */
export interface NarrativeStore {
  /** null when absent or when the stored JSON no longer parses (a corrupt row = missing). */
  read(repoId: string): Promise<StoredNarrativeState | null>;
  /** One upsert per state transition; `repo_gone` when the repo was deleted meanwhile (FK). */
  write(repoId: string, state: StoredNarrativeState): Promise<'ok' | 'repo_gone'>;
}
