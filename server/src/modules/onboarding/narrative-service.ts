/**
 * OnboardingNarrativeService — the AI narrative overlay of the onboarding tour.
 *
 * Two jobs, both over narrow ports (never the container):
 *   - `forTour` (the `TourOverlay` seam): one storage read plus a synchronous
 *     price estimate. Never an LLM call.
 *   - `requestGeneration`: validates, claims the repo's single-flight slot, writes
 *     `generating`, and returns without waiting; `run` makes exactly ONE
 *     `completeStructured` call (no re-prompt, no HTTP retries, 60 s) and
 *     persists the grounded result or a failure that never touches the last good
 *     narrative. JobRunner is deliberately not used: it would add its own
 *     timeout/retries on top.
 *
 * In-memory state (single-flight map, rate-limit windows) lives here, so the
 * container memoizes the instance. Logs carry metadata only, never file text,
 * prompts or model output.
 */
import { randomUUID } from 'node:crypto';
import type {
  FeatureModelChoice,
  GitClient,
  LLMProvider,
  NarrativeFailureReason,
  NarrativeSectionKey,
  OnboardingNarrative,
  Provider,
  RepoRef,
} from '@devdigest/shared';
import { ConfigError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import type { RepoIntel } from '../repo-intel/types.js';
import { MAX_FILE_BYTES } from './facts/constants.js';
import { groundNarrative } from './narrative/ground.js';
import { buildNarrativeInput, selectExcerptPaths, type NarrativeExcerpt } from './narrative/input.js';
import { NARRATIVE_MAX_TOKENS, NARRATIVE_TIMEOUT_MS, RATE_LIMIT } from './narrative/constants.js';
import { NarrativeModelOutput } from './narrative/output-schema.js';
import { estimateCost, needsPersistInterrupted, toNarrativeView } from './narrative/overlay.js';
import type { NarrativeFactsInput, StoredNarrativeState } from './narrative/types.js';
import type {
  NarrativeStore,
  TourFacts,
  TourLogger,
  TourOverlay,
  TourOverlayResult,
  TourRepoStore,
} from './types.js';

const SCHEMA_NAME = 'OnboardingNarrative';
const TEMPERATURE = 0.2;
const REPO_MAP_TOKEN_BUDGET = 2000;

export type GenerationRequest =
  | { kind: 'rate_limited' }
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  | { kind: 'accepted'; id: string; alreadyRunning: boolean };

/** The repository implements both the narrative store and the repo lookup. */
export type NarrativeServiceStore = NarrativeStore & Pick<TourRepoStore, 'getRepo'>;

/** The model answered, but nothing usable survived validation. */
class InvalidOutputError extends Error {
  override readonly name = 'InvalidOutputError';
}

/** Maps a failure to its stored reason by error name (messages are never inspected for leaks). */
export function classifyFailure(err: unknown): NarrativeFailureReason {
  const name = err instanceof Error ? err.name : '';
  if (err instanceof ConfigError || name === 'ConfigError') return 'missing_key';
  if (err instanceof TimeoutError || name === 'TimeoutError' || name === 'AbortError' || name === 'APIConnectionTimeoutError') {
    return 'llm_timeout';
  }
  if (name === 'NoEligibleProviderError') return 'no_structured_provider';
  if (name === 'InvalidOutputError' || name === 'ZodError' || name === 'SyntaxError') return 'invalid_output';
  const message = err instanceof Error ? err.message : '';
  if (/schema validation|returned no choices|empty (response|output)/i.test(message)) return 'invalid_output';
  return 'llm_error';
}

const toFactsInput = (facts: TourFacts): NarrativeFactsInput => {
  const sections = facts.sections!;
  return {
    sections,
    source_sha: facts.source_sha!,
    paths: new Set(facts.treeIndex.keys()),
    commandIds: new Set(sections.run_locally.groups.flatMap((g) => g.commands.map((c) => c.id))),
    taskIds: new Set(sections.first_tasks.items.map((i) => i.id)),
    stack: sections.architecture.stack,
    modules: sections.architecture.modules,
  };
};

export class OnboardingNarrativeService implements TourOverlay {
  /** repoId → generationId of the run executing in this process. */
  private readonly inFlight = new Map<string, string>();
  /** workspaceId → start times of accepted requests inside the sliding window. */
  private readonly windows = new Map<string, number[]>();

  constructor(
    private readonly store: NarrativeServiceStore,
    private readonly facts: { getFacts(workspaceId: string, repoId: string): Promise<TourFacts> },
    private readonly repoMap: Pick<RepoIntel, 'getRepoMap'>,
    private readonly git: Pick<GitClient, 'readBlob'>,
    private readonly llmFor: (provider: Provider) => Promise<LLMProvider>,
    private readonly modelFor: (workspaceId: string) => Promise<FeatureModelChoice>,
    private readonly estimate: (model: string, tokensIn: number, tokensOut: number) => number | null,
    private readonly count: (text: string) => number,
    private readonly frame: (label: string, content: string) => string,
    private readonly loadSystemPrompt: () => Promise<string>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---- Overlay (GET /tour) ------------------------------------------------

  async forTour(workspaceId: string, repoId: string, factsSha: string | null): Promise<TourOverlayResult> {
    const choice = await this.modelFor(workspaceId);
    const estimated_cost = estimateCost(choice.model, this.estimate);
    let stored = await this.store.read(repoId);
    if (!stored) return { narrative: null, estimated_cost };

    if (needsPersistInterrupted(stored, this.now(), this.isInFlight)) {
      stored = (await this.persistInterrupted(repoId, choice)) ?? stored;
    }
    const narrative = toNarrativeView(stored, factsSha ?? '', this.now(), this.isInFlight);
    return { narrative, estimated_cost };
  }

  private readonly isInFlight = (generationId: string): boolean => {
    for (const id of this.inFlight.values()) if (id === generationId) return true;
    return false;
  };

  /** Re-reads the row; writes `interrupted` only if it is still a dead `generating` row. */
  private async persistInterrupted(
    repoId: string,
    choice: FeatureModelChoice,
  ): Promise<StoredNarrativeState | null> {
    const fresh = await this.store.read(repoId);
    if (!fresh?.generation || !needsPersistInterrupted(fresh, this.now(), this.isInFlight)) return fresh;
    const next: StoredNarrativeState = {
      narrative: fresh.narrative,
      generation: {
        ...fresh.generation,
        status: 'failed',
        last_failure: {
          reason: 'interrupted',
          at: this.now().toISOString(),
          provider: choice.provider,
          model: choice.model,
        },
      },
    };
    const result = await this.store.write(repoId, next);
    return result === 'ok' ? next : null;
  }

  // ---- Generation (POST /tour/narrative) ----------------------------------

  async requestGeneration(workspaceId: string, repoId: string, logger?: TourLogger): Promise<GenerationRequest> {
    if (!this.takeToken(workspaceId)) return { kind: 'rate_limited' };

    const repo = await this.store.getRepo(workspaceId, repoId);
    if (!repo) return { kind: 'not_found' };
    const facts = await this.facts.getFacts(workspaceId, repoId);
    if (facts.availability !== 'available' || !facts.sections || !facts.source_sha) {
      return { kind: 'unavailable' };
    }

    const running = this.inFlight.get(repoId);
    if (running) return { kind: 'accepted', id: running, alreadyRunning: true };

    // Claim the slot synchronously (no await since the check above).
    const id = randomUUID();
    this.inFlight.set(repoId, id);
    try {
      const existing = await this.store.read(repoId);
      const result = await this.store.write(repoId, {
        narrative: existing?.narrative ?? null,
        generation: { id, status: 'generating', started_at: this.now().toISOString(), last_failure: null },
      });
      if (result === 'repo_gone') {
        this.inFlight.delete(repoId);
        return { kind: 'not_found' };
      }
    } catch (err) {
      this.inFlight.delete(repoId);
      throw err;
    }

    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    void this.run(workspaceId, repoId, id, ref, facts, logger);
    return { kind: 'accepted', id, alreadyRunning: false };
  }

  /** Sliding window per workspace; a request that passes is recorded. */
  private takeToken(workspaceId: string): boolean {
    const nowMs = this.now().getTime();
    const recent = (this.windows.get(workspaceId) ?? []).filter((t) => nowMs - t < RATE_LIMIT.windowMs);
    if (recent.length >= RATE_LIMIT.max) {
      this.windows.set(workspaceId, recent);
      return false;
    }
    recent.push(nowMs);
    this.windows.set(workspaceId, recent);
    return true;
  }

  private async run(
    workspaceId: string,
    repoId: string,
    generationId: string,
    ref: RepoRef,
    facts: TourFacts,
    logger?: TourLogger,
  ): Promise<void> {
    const sourceSha = facts.source_sha;
    const startedAt = this.now().getTime();
    let choice: FeatureModelChoice | null = null;
    try {
      choice = await this.modelFor(workspaceId);
      const llm = await this.llmFor(choice.provider); // ConfigError ⇒ missing_key, no call made

      const factsInput = toFactsInput(facts);
      const excerpts = await this.readExcerpts(ref, facts, factsInput);
      const repoMap = await this.repoMap.getRepoMap(repoId, REPO_MAP_TOKEN_BUDGET);
      const input = buildNarrativeInput({
        facts: factsInput,
        repoMap: repoMap.text,
        excerpts,
        count: this.count,
        frame: this.frame,
      });
      const system = await this.loadSystemPrompt();

      const res = await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: NarrativeModelOutput,
          schemaName: SCHEMA_NAME,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: input.userMessage },
          ],
          temperature: TEMPERATURE,
          maxTokens: NARRATIVE_MAX_TOKENS,
          timeoutMs: NARRATIVE_TIMEOUT_MS,
          maxRetries: 0,
          httpRetries: 0,
          requireStructuredProviders: true,
        }),
        NARRATIVE_TIMEOUT_MS,
      );

      const grounded = groundNarrative(res.data, factsInput);
      const fallback: NarrativeSectionKey[] = grounded.fallback;
      if (Object.values(grounded.sections).every((s) => s === null)) {
        throw new InvalidOutputError('no section survived validation');
      }

      const row = await this.store.read(repoId);
      if (row?.generation?.id !== generationId) {
        logger?.warn({ repoId, generationId, source_sha: sourceSha, reason: 'superseded' }, 'tour narrative: result discarded');
        return;
      }
      const narrative: Omit<OnboardingNarrative, 'status' | 'outdated'> = {
        generation_id: generationId,
        source_sha: facts.source_sha,
        generated_at: this.now().toISOString(),
        provider: choice.provider,
        model: res.model || choice.model,
        input_tokens: res.tokensIn,
        output_tokens: res.tokensOut,
        cost_usd: res.costUsd,
        last_failure: null,
        fallback_sections: fallback,
        sections: grounded.sections,
      };
      const written = await this.store.write(repoId, {
        narrative,
        generation: { ...row.generation, status: 'ready', last_failure: null },
      });
      logger?.info(
        {
          repoId,
          generationId,
          source_sha: sourceSha,
          provider: choice.provider,
          model: narrative.model,
          tokensIn: res.tokensIn,
          tokensOut: res.tokensOut,
          costUsd: res.costUsd,
          durationMs: this.now().getTime() - startedAt,
          outcome: written === 'ok' ? 'ready' : 'discarded',
          fallbackSections: fallback,
        },
        'tour narrative: generated',
      );
    } catch (err) {
      await this.recordFailure(repoId, generationId, sourceSha, choice, err, startedAt, logger);
    } finally {
      if (this.inFlight.get(repoId) === generationId) this.inFlight.delete(repoId);
    }
  }

  /** Reads each selected excerpt from git at the request's SHA; unreadable ones are skipped. */
  private async readExcerpts(
    ref: RepoRef,
    facts: TourFacts,
    factsInput: NarrativeFactsInput,
  ): Promise<NarrativeExcerpt[]> {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const out: NarrativeExcerpt[] = [];
    for (const path of selectExcerptPaths(factsInput)) {
      const entry = facts.treeIndex.get(path);
      if (!entry || entry.kind !== 'blob') continue;
      try {
        const bytes = await this.git.readBlob(ref, entry.oid, MAX_FILE_BYTES);
        out.push({ path, content: decoder.decode(bytes) });
      } catch {
        // Too large, binary or unreadable: the narrative simply has no excerpt for it.
      }
    }
    return out;
  }

  /** Writes only `generation` — the last good `narrative` is never overwritten. */
  private async recordFailure(
    repoId: string,
    generationId: string,
    sourceSha: string | null,
    choice: FeatureModelChoice | null,
    err: unknown,
    startedAt: number,
    logger?: TourLogger,
  ): Promise<void> {
    const reason = classifyFailure(err);
    const meta = {
      repoId,
      generationId,
      source_sha: sourceSha,
      reason,
      provider: choice?.provider ?? null,
      model: choice?.model ?? null,
      durationMs: this.now().getTime() - startedAt,
      outcome: 'failed',
    };
    try {
      const row = await this.store.read(repoId);
      if (row?.generation?.id !== generationId) {
        logger?.warn(meta, 'tour narrative: failure not recorded (superseded)');
        return;
      }
      await this.store.write(repoId, {
        narrative: row.narrative,
        generation: {
          ...row.generation,
          status: 'failed',
          last_failure: {
            reason,
            at: this.now().toISOString(),
            provider: choice?.provider ?? null,
            model: choice?.model ?? null,
          },
        },
      });
      logger?.warn(meta, 'tour narrative: failed');
    } catch {
      logger?.warn({ ...meta, outcome: 'failure_not_persisted' }, 'tour narrative: failure not recorded');
    }
  }
}
