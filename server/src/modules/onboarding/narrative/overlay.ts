import type { OnboardingEstimatedCost, OnboardingNarrative } from '@devdigest/shared';
import {
  ESTIMATE_INPUT_TOKENS,
  INTERRUPTED_AFTER_MS,
  NARRATIVE_MAX_TOKENS,
} from './constants.js';
import type { StoredNarrativeState } from './types.js';

const EMPTY_SECTIONS: OnboardingNarrative['sections'] = {
  architecture: null,
  critical_paths: null,
  run_locally: null,
  reading_path: null,
  first_tasks: null,
};

/**
 * A `generating` row is interrupted when its id is not in flight in this
 * process (restart) or it is older than INTERRUPTED_AFTER_MS. Computed on
 * read; the caller may persist it (re-reading the row first).
 */
export function needsPersistInterrupted(
  stored: StoredNarrativeState,
  now: Date,
  isInFlight: (generationId: string) => boolean,
): boolean {
  const gen = stored.generation;
  if (!gen || gen.status !== 'generating') return false;
  return !isInFlight(gen.id) || now.getTime() - Date.parse(gen.started_at) > INTERRUPTED_AFTER_MS;
}

/**
 * Overlay view of stored state for `GET /tour`. A failed latest generation
 * never removes the previous good narrative.
 */
export function toNarrativeView(
  stored: StoredNarrativeState,
  factsSha: string,
  now: Date,
  isInFlight: (generationId: string) => boolean,
): OnboardingNarrative | null {
  const { narrative, generation } = stored;
  if (!narrative && !generation) return null;
  const interrupted = needsPersistInterrupted(stored, now, isInFlight);
  const status = interrupted ? 'failed' : (generation?.status ?? 'ready');
  const last_failure =
    status !== 'failed'
      ? null
      : interrupted
        ? { reason: 'interrupted' as const, at: now.toISOString(), provider: null, model: null }
        : (generation?.last_failure ?? null);

  if (!narrative) {
    // Nothing good stored: only a generating/failed state is worth showing.
    if (!generation || status === 'ready') return null;
    return {
      status,
      generation_id: generation.id,
      source_sha: null,
      outdated: false,
      generated_at: null,
      provider: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      last_failure,
      fallback_sections: [],
      sections: EMPTY_SECTIONS,
    };
  }
  return {
    ...narrative,
    status,
    generation_id: generation?.id ?? narrative.generation_id,
    outdated: narrative.source_sha !== factsSha,
    last_failure,
  };
}

/**
 * Rough pre-generation estimate: a full input plus the output cap, priced by
 * the injected synchronous `estimate` (null when the model has no price).
 */
export function estimateCost(
  model: string,
  estimate: (model: string, tokensIn: number, tokensOut: number) => number | null,
): OnboardingEstimatedCost {
  return { model, approx_usd: estimate(model, ESTIMATE_INPUT_TOKENS, NARRATIVE_MAX_TOKENS) };
}
