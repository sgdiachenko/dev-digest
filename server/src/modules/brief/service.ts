/**
 * PR Brief use case. Ports are declared HERE (the consumer); the container's
 * memoized repositories / services satisfy them structurally.
 *
 * `getBrief`  — pure read: no LLM / GitHub / git.
 * `generate`  — synchronous, ONE structured LLM call over already computed
 *               facts. Single-flight per PR, rate-limited per workspace, bounded
 *               by an overall request deadline. A started generation is not tied
 *               to the request (it persists after a client disconnect) but
 *               NOTHING is written once the deadline has passed.
 */
import type {
  BlastRadius,
  BlastRadiusResponse,
  BriefMissingInput,
  FeatureModelChoice,
  GitHubClient,
  Intent,
  LLMProvider,
  PrBriefRecord,
  PrIntentRecord,
  Provider,
  RepoRef,
} from '@devdigest/shared';
import {
  AppError,
  ConfigError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  TooManyRequestsError,
} from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import type { ProjectContextForRepo, RepoContextResult } from '../context-attachments/types.js';
import { classifyFile } from '../smart-diff/classify.js';
import {
  BLAST_TIMEOUT_MS,
  ISSUE_TIMEOUT_MS,
  LLM_TIMEOUT_MS,
  MAX_OUTPUT_TOKENS,
  RATE_LIMIT,
  REQUEST_DEADLINE_MS,
  SCHEMA_NAME,
  SPECS_TIMEOUT_MS,
  STORED_SCHEMA_VERSION,
  TEMPERATURE,
} from './constants.js';
import {
  addedLineRanges,
  blastMissingReason,
  blastPathsOf,
  BriefInputOverBudgetError,
  classifyBriefFailure,
  InvalidBriefOutputError,
  pickLinkedIssueNumber,
  projectBlast,
  specsMissingReason,
  StoredBrief,
  toBriefRecord,
  validateBriefOutput,
  type BlastOutcome,
  type LineRange,
} from './helpers.js';
import { BriefModelOutput, buildBriefInput, buildBriefSystemPrompt, type BriefFacts } from './prompt.js';

// ============================================================ Ports

export interface BriefStore {
  get(prId: string): Promise<StoredBrief | null>;
  replace(prId: string, doc: StoredBrief): Promise<void>;
}

export interface BriefPull {
  id: string;
  repoId: string;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
  filesCount: number;
}

export interface BriefPullStore {
  findPull(workspaceId: string, prId: string): Promise<BriefPull | undefined>;
  findRepo(workspaceId: string, repoId: string): Promise<{ owner: string; name: string } | undefined>;
  listFiles(prId: string): Promise<{ path: string; additions: number; deletions: number; patch: string | null }[]>;
}

export interface BriefIntentReader {
  getIntent(workspaceId: string, prId: string): Promise<PrIntentRecord | null>;
}

export interface BriefBlastReader {
  getBlast(workspaceId: string, prId: string): Promise<BlastRadiusResponse>;
}

/** Minimal pino-compatible logger surface (metadata only — never prompt, PR text or model output). */
export interface BriefLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

/** Every timeout / deadline, overridable so tests need not wait real seconds. */
export interface BriefLimits {
  blastMs: number;
  issueMs: number;
  specsMs: number;
  llmMs: number;
  requestDeadlineMs: number;
}

export const DEFAULT_LIMITS: BriefLimits = {
  blastMs: BLAST_TIMEOUT_MS,
  issueMs: ISSUE_TIMEOUT_MS,
  specsMs: SPECS_TIMEOUT_MS,
  llmMs: LLM_TIMEOUT_MS,
  requestDeadlineMs: REQUEST_DEADLINE_MS,
};

/** Shared with the running generation so a late finisher knows the response is already gone. */
interface RunState {
  abandoned: boolean;
  deadlineAt: number;
  /** Metadata known so far, filled in as the run progresses; the single completion record reads it. */
  telemetry: BriefTelemetry;
}

/** Metadata-only fields of the completion log record (never prompt, PR text, issue, spec or model output). */
interface BriefTelemetry {
  provider: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  input_tokens_est: number | null;
  budget: unknown;
  trimmed_sections: string[] | null;
  missing_sections: BriefMissingInput[] | null;
  dropped: { refs: number; risks: number; focus: number } | null;
}

const emptyTelemetry = (): BriefTelemetry => ({
  provider: null,
  model: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  input_tokens_est: null,
  budget: null,
  trimmed_sections: null,
  missing_sections: null,
  dropped: null,
});

// ============================================================ Service

export class BriefService {
  /** One in-flight generation per (workspace, PR): later callers share its promise. */
  private readonly inFlight = new Map<string, Promise<PrBriefRecord>>();
  /** Sliding-window request timestamps per workspace (in-process; a restart resets it). */
  private readonly windows = new Map<string, number[]>();
  private readonly limits: BriefLimits;

  constructor(
    private readonly store: BriefStore,
    private readonly pulls: BriefPullStore,
    private readonly intent: BriefIntentReader,
    private readonly blast: BriefBlastReader,
    private readonly specs: ProjectContextForRepo,
    private readonly githubFor: () => Promise<GitHubClient>,
    private readonly llmFor: (provider: Provider) => Promise<LLMProvider>,
    private readonly modelFor: (workspaceId: string) => Promise<FeatureModelChoice>,
    private readonly count: (text: string) => number,
    private readonly wrap: (label: string, content: string) => string,
    private readonly now: () => Date = () => new Date(),
    limits: Partial<BriefLimits> = {},
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  /** `GET /pulls/:id/brief` — the stored record or `null`; no LLM / GitHub / git. */
  async getBrief(workspaceId: string, prId: string): Promise<PrBriefRecord | null> {
    const pull = await this.pulls.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const stored = await this.store.get(prId);
    return stored ? toBriefRecord(prId, stored, pull.headSha) : null;
  }

  /** `POST /pulls/:id/brief` — generate, store and return a fresh brief. */
  async generate(workspaceId: string, prId: string, logger?: BriefLogger): Promise<PrBriefRecord> {
    const pull = await this.pulls.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    if (!this.takeToken(workspaceId)) throw new TooManyRequestsError('Too many brief requests, try again shortly');

    const key = `${workspaceId}:${prId}`;
    const running = this.inFlight.get(key);
    if (running) return running;

    const promise = this.run(workspaceId, pull, logger).finally(() => {
      if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
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

  // ---------------------------------------------------------- run

  private async run(workspaceId: string, pull: BriefPull, logger?: BriefLogger): Promise<PrBriefRecord> {
    const startedAt = Date.now();
    const state: RunState = {
      abandoned: false,
      deadlineAt: startedAt + this.limits.requestDeadlineMs,
      telemetry: emptyTelemetry(),
    };
    // Created before `withTimeout`'s own timer so it fires first: the flag is set before any
    // continuation of `execute` can observe a passed deadline.
    const flagTimer = setTimeout(() => {
      state.abandoned = true;
    }, this.limits.requestDeadlineMs);
    try {
      const record = await withTimeout(this.execute(workspaceId, pull, state), this.limits.requestDeadlineMs);
      logger?.info(
        { event: 'brief.completed', outcome: 'ok', ...state.telemetry, durationMs: Date.now() - startedAt },
        'brief: completed',
      );
      return record;
    } catch (err) {
      let failure = err;
      if (err instanceof TimeoutError) {
        state.abandoned = true;
        failure = new ExternalServiceError('Brief generation timed out', { reason: 'llm_timeout' });
      }
      logger?.warn(
        {
          event: 'brief.completed',
          outcome: 'failed',
          reason: reasonOf(failure),
          ...state.telemetry,
          durationMs: Date.now() - startedAt,
        },
        'brief: completed',
      );
      throw failure;
    } finally {
      clearTimeout(flagTimer);
    }
  }

  private async execute(
    workspaceId: string,
    pull: BriefPull,
    state: RunState,
  ): Promise<PrBriefRecord> {
    const files = await this.pulls.listFiles(pull.id);
    if (files.length === 0) throw new ConflictError('The PR has no stored diff', { reason: 'no_diff_data' });
    const repo = await this.pulls.findRepo(workspaceId, pull.repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    const choice = await this.modelFor(workspaceId);
    state.telemetry.provider = choice.provider;
    state.telemetry.model = choice.model;
    let llm: LLMProvider;
    try {
      llm = await this.llmFor(choice.provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new ConflictError('No API key configured for the brief model', {
          reason: 'missing_key',
          provider: choice.provider,
        });
      }
      throw err;
    }

    const headSha = pull.headSha;
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const [intent, blast, issue, specs] = await Promise.all([
      this.readIntent(workspaceId, pull.id),
      this.readBlast(workspaceId, pull.id),
      this.readIssue(pull, ref),
      this.readSpecs(workspaceId, pull.repoId),
    ]);

    const missing: BriefMissingInput[] = [];
    const addMissing = (input: BriefMissingInput['input'], reason: BriefMissingInput['reason']) => {
      if (!missing.some((m) => m.input === input && m.reason === reason)) missing.push({ input, reason });
    };
    if (intent.missing) addMissing('intent', intent.missing);
    if (intent.stale) addMissing('intent', 'stale');
    if (blast.missing) addMissing('blast', blast.missing);
    if (issue.missing) addMissing('linked_issue', issue.missing);
    if (specs.missing) addMissing('specs', specs.missing);
    if (pull.filesCount > files.length) addMissing('diff_stats', 'truncated');

    const rangesByPath = new Map<string, LineRange[]>(files.map((f) => [f.path, addedLineRanges(f.patch)]));
    const facts: BriefFacts = {
      title: pull.title,
      description: pull.body,
      linkedIssue: issue.value,
      intent: intent.value ? { value: intent.value, stale: intent.stale } : null,
      blast: blast.value,
      files: files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        role: classifyFile(f.path),
        ranges: rangesByPath.get(f.path) ?? [],
      })),
      filesCountReported: pull.filesCount,
      specs: specs.docs,
    };

    let input;
    try {
      input = buildBriefInput(facts, { count: this.count, wrap: this.wrap });
    } catch (err) {
      if (err instanceof BriefInputOverBudgetError) {
        throw new AppError('input_over_budget', 'The brief input exceeds the token budget', 500, {
          reason: 'input_over_budget',
        });
      }
      throw err;
    }
    for (const m of input.missing) addMissing(m.input, m.reason);
    state.telemetry.input_tokens_est = input.estTokens;
    state.telemetry.budget = input.budget;
    state.telemetry.trimmed_sections = input.missing.filter((m) => m.reason === 'over_budget').map((m) => m.input);
    state.telemetry.missing_sections = missing;

    const llmMs = Math.min(this.limits.llmMs, state.deadlineAt - Date.now());
    if (llmMs <= 0) throw new ExternalServiceError('Brief generation timed out', { reason: 'llm_timeout' });

    let result;
    try {
      result = await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: BriefModelOutput,
          schemaName: SCHEMA_NAME,
          messages: [
            { role: 'system', content: buildBriefSystemPrompt() },
            { role: 'user', content: input.user },
          ],
          temperature: TEMPERATURE,
          maxTokens: MAX_OUTPUT_TOKENS,
          timeoutMs: llmMs,
          maxRetries: 0,
          httpRetries: 0,
        }),
        llmMs,
      );
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError('The brief model call failed', { reason: classifyBriefFailure(err) });
    }

    state.telemetry.tokens_in = result.tokensIn;
    state.telemetry.tokens_out = result.tokensOut;
    state.telemetry.cost_usd = result.costUsd;
    state.telemetry.model = result.model || choice.model;

    let doc: StoredBrief;
    try {
      if (result.data.summary.trim().length === 0) throw new InvalidBriefOutputError('empty summary');
      const validated = validateBriefOutput(result.data, {
        prPaths: new Set(files.map((f) => f.path)),
        blastPaths: blastPathsOf(input.sentBlast),
        rangesByPath,
      });
      state.telemetry.dropped = validated.dropped;
      doc = StoredBrief.parse({
        summary: validated.summary,
        review_focus: validated.review_focus,
        intent: input.sentIntent,
        blast: input.sentBlast,
        risks: { risks: validated.risks },
        history: null,
        head_sha: headSha,
        generated_at: this.now().toISOString(),
        provider: choice.provider,
        model: result.model || choice.model,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd,
        input_tokens_est: input.estTokens,
        missing_inputs: missing,
        specs_sha: specs.sha,
        specs_used: input.specsUsed,
        schema_version: STORED_SCHEMA_VERSION,
      });
    } catch {
      throw new ExternalServiceError('The brief model returned no usable output', { reason: 'invalid_output' });
    }

    // Checked immediately before the write: past the deadline the caller already got a 502, so
    // nothing may be stored (the previous brief stays authoritative).
    if (state.abandoned || Date.now() >= state.deadlineAt) {
      throw new ExternalServiceError('Brief generation timed out', { reason: 'llm_timeout' });
    }
    await this.store.replace(pull.id, doc);

    // Re-read so a head SHA that moved while the model ran reads as stale right away.
    const current = await this.pulls.findPull(workspaceId, pull.id);
    return toBriefRecord(pull.id, doc, current?.headSha ?? headSha);
  }

  // ---------------------------------------------------------- input readers

  private async readIntent(
    workspaceId: string,
    prId: string,
  ): Promise<{ value: Intent | null; stale: boolean; missing: BriefMissingInput['reason'] | null }> {
    try {
      const record = await this.intent.getIntent(workspaceId, prId);
      if (!record) return { value: null, stale: false, missing: 'not_derived' };
      return {
        value: { intent: record.intent, in_scope: record.in_scope, out_of_scope: record.out_of_scope },
        stale: record.stale,
        missing: null,
      };
    } catch {
      return { value: null, stale: false, missing: 'unavailable' };
    }
  }

  private async readBlast(
    workspaceId: string,
    prId: string,
  ): Promise<{ value: BlastRadius | null; missing: BriefMissingInput['reason'] | null }> {
    let outcome: BlastOutcome;
    let response: BlastRadiusResponse | null = null;
    try {
      response = await withTimeout(this.blast.getBlast(workspaceId, prId), this.limits.blastMs);
      outcome = { kind: 'ok', degraded: response.degraded, reason: response.reason };
    } catch (err) {
      outcome = err instanceof TimeoutError ? { kind: 'timeout' } : { kind: 'error' };
    }
    const missing = blastMissingReason(outcome);
    return { value: missing || !response ? null : projectBlast(response), missing };
  }

  private async readIssue(
    pull: BriefPull,
    ref: RepoRef,
  ): Promise<{ value: BriefFacts['linkedIssue']; missing: BriefMissingInput['reason'] | null }> {
    const number = pickLinkedIssueNumber(pull, ref);
    if (number === null) return { value: null, missing: null };
    try {
      const issue = await withTimeout(
        (async () => (await this.githubFor()).getIssue(ref, number))(),
        this.limits.issueMs,
      );
      return { value: { number: issue.number, title: issue.title, body: issue.body ?? '' }, missing: null };
    } catch {
      return { value: null, missing: 'github_unavailable' };
    }
  }

  private async readSpecs(
    workspaceId: string,
    repoId: string,
  ): Promise<{ docs: { path: string; text: string }[]; sha: string | null; missing: BriefMissingInput['reason'] | null }> {
    let result: RepoContextResult;
    try {
      result = await withTimeout(this.specs.resolveForRepo(workspaceId, repoId), this.limits.specsMs);
    } catch (err) {
      result = { kind: 'unavailable', reason: err instanceof TimeoutError ? 'timeout' : 'error' };
    }
    const missing = specsMissingReason(result);
    if (result.kind !== 'resolved' || missing) return { docs: [], sha: null, missing };
    return { docs: result.docs.map((d) => ({ path: d.path, text: d.text })), sha: result.sha, missing: null };
  }
}

/** The response reason of a failure, for the log line (never the message). */
function reasonOf(err: unknown): string {
  const details = err instanceof AppError ? (err.details as { reason?: unknown } | undefined) : undefined;
  if (typeof details?.reason === 'string') return details.reason;
  return err instanceof AppError ? err.code : 'internal';
}
