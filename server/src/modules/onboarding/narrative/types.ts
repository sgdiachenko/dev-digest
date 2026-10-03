import { z } from 'zod';
import {
  NarrativeStatus,
  OnboardingNarrative,
  OnboardingNarrativeFailure,
  type OnboardingModule,
  type OnboardingSections,
  type OnboardingStackEntry,
} from '@devdigest/shared';

/**
 * Structural input the narrative functions need from the facts tour. Built by
 * the caller (service) from the facts result; this folder never imports the
 * facts folder.
 */
export interface NarrativeFactsInput {
  sections: OnboardingSections;
  source_sha: string;
  /** Every path that exists in the tree at `source_sha`. */
  paths: ReadonlySet<string>;
  commandIds: ReadonlySet<string>;
  taskIds: ReadonlySet<string>;
  stack: readonly OnboardingStackEntry[];
  modules: readonly OnboardingModule[];
}

/** The persisted "good" narrative: a view minus the per-request fields. */
export const StoredNarrative = OnboardingNarrative.omit({ status: true, outdated: true });
export type StoredNarrative = z.infer<typeof StoredNarrative>;

export const StoredGeneration = z.object({
  id: z.string(),
  status: NarrativeStatus,
  started_at: z.string().datetime(),
  last_failure: OnboardingNarrativeFailure.nullable(),
});
export type StoredGeneration = z.infer<typeof StoredGeneration>;

export const StoredNarrativeState = z.object({
  narrative: StoredNarrative.nullable(),
  generation: StoredGeneration.nullable(),
});
export type StoredNarrativeState = z.infer<typeof StoredNarrativeState>;
