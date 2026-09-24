import type {
  FeatureModelChoice,
  GitClient,
  GitHubClient,
  IntentSource,
  IntentSourceKind,
  LLMProvider,
  PrIntentRecord,
  Provider,
  RepoRef,
  RunEventKind,
} from '@devdigest/shared';
import { randomUUID } from 'node:crypto';
import { summarizePrompt, type PromptIntent, type PromptLogLevel, type SectionInput } from '@devdigest/reviewer-core';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { BlobTooLargeError } from '../../adapters/git/show-file-at-guard.js';
import type { IntentPullContext, IntentRow, UpsertIntentValues } from './repository.js';
import { buildIntentSystemPrompt, buildIntentUserPrompt, IntentExtraction } from './prompt.js';
import {
  applyLowConfidenceScopeGuard,
  clampExtraction,
  computeBaseConfidence,
  computeInputHash,
  countSubstantiveWords,
  downgradeConfidence,
  extractReferences,
  fitSourcesToBudget,
  selectChangedSpecDocs,
  type PromptSourceEntry,
  type SourceSignal,
} from './helpers.js';
import {
  EXTRACT_MAX_RETRIES,
  EXTRACT_MAX_TOKENS,
  EXTRACT_TEMPERATURE,
  EXTRACT_TIMEOUT_MS,
  MAX_CHANGED_PATHS,
  MAX_CHANGED_SPEC_DOC_CHARS,
  MAX_CHANGED_SPEC_DOCS,
  MAX_COMMIT_MESSAGE_LINES,
  MAX_COMMIT_MESSAGES_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_ISSUE_CHARS,
  MAX_SPEC_DOC_CHARS,
  MAX_SPEC_DOC_READ_BYTES,
  MAX_TITLE_CHARS,
  MAX_USER_MESSAGE_CHARS,
  MIN_DESCRIPTION_WORDS,
} from './constants.js';

/** Minimal pino-compatible logger surface — used by the route-facing methods
 *  (`deriveIntent`/POST, `getIntent`/GET), which have no Live Log to stream
 *  into. */
export interface IntentLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

/**
 * What this service needs from persistence — declared HERE (the consumer),
 * not by importing `IntentRepository` as a value (onion-architecture:
 * service-takes-ports-not-concrete-repository). `IntentRepository` satisfies
 * this structurally.
 */
export interface IntentStore {
  getPullContext(workspaceId: string, prId: string): Promise<IntentPullContext | undefined>;
  get(prId: string): Promise<IntentRow | undefined>;
  upsert(prId: string, values: UpsertIntentValues): Promise<IntentRow>;
}

/**
 * Progress/observability sink, same shape as `reviewPullRequest`'s own
 * `onEvent` (plan S7). The review executor bridges this straight into its
 * `RunLogger.event(kind, msg, data)` — which streams to the Live Log AND
 * mirrors to the structured pino logger AND lands in the persisted trace, all
 * for free. `deriveIntent`/`getIntent` (route-facing, no Live Log) adapt a
 * plain pino-style `IntentLogger` into this shape instead.
 */
export type IntentEmit = (kind: RunEventKind, msg: string, data?: unknown) => void;

const NOOP_EMIT: IntentEmit = () => {};

function emitFromLogger(logger: IntentLogger | undefined): IntentEmit {
  if (!logger) return NOOP_EMIT;
  return (kind, msg, data) => (kind === 'error' ? logger.warn(data ?? {}, msg) : logger.info(data ?? {}, msg));
}

/** One resolved (or attempted) source: metadata for persistence/confidence,
 *  plus the prompt content when there is any to send. */
interface Candidate {
  kind: IntentSourceKind;
  ref: string;
  linked: boolean;
  resolved: boolean;
  note: string | null;
  /** Prompt label + content — omitted for sources with nothing to send
   *  (e.g. `external_ref`, which is recorded but never fetched — Q1). */
  prompt?: { label: string; content: string };
}

function candidateSignal(c: Candidate): SourceSignal {
  return {
    kind: c.kind,
    linked: c.linked,
    resolved: c.resolved,
    contentChars: c.prompt?.content.length ?? 0,
  };
}

export interface DeriveResult {
  row: IntentRow;
  cacheHit: boolean;
}

/** One in-flight derivation for a (workspace, PR): whether it was started as
 *  a forced (POST, cache-ignoring) run, and the promise itself. */
interface InFlightRun {
  forced: boolean;
  promise: Promise<DeriveResult>;
}

/**
 * Intent Layer use case.
 *
 * `deriveForReview` — best-effort, cache-preferring; called from the review
 * executor. Throws on failure (PR/repo missing, GitHub/git/LLM error, empty
 * model output) — the executor's own `try/catch` around the call is what
 * makes it non-fatal (plan: "будь-яка помилка → info … рев'ю йде далі"); this
 * service does not swallow errors itself, or that Live Log line never fires.
 * `deriveIntent` — always re-derives (POST /pulls/:id/intent); synchronous,
 * ≤30s (Q6), persists even if the caller disconnects since this method itself
 * is not tied to the request lifecycle.
 * `getIntent` — pure read (GET /pulls/:id/intent): no LLM/GitHub/git calls.
 */
export class IntentService {
  /**
   * Single-flight per (workspace, PR): concurrent derive calls for the same
   * PR share one in-flight run instead of double-billing the model.
   *
   * Semantics when a call arrives while one is already in flight:
   *  - non-forced (review-triggered) caller → shares whatever is in flight,
   *    forced or not (a fresh derivation, of any kind, always satisfies it).
   *  - forced (POST) caller sharing an already-FORCED in-flight run → shares
   *    it too (it's already the fresh, cache-ignoring run it wants).
   *  - forced (POST) caller sharing a NON-forced in-flight run → does NOT
   *    share it (that run might resolve as a cache hit, which would violate
   *    POST's "always re-derives" contract) — awaits it first (so two model
   *    calls for the same PR never run at once), then starts its own forced
   *    run.
   */
  private inFlight = new Map<string, InFlightRun>();

  constructor(
    private readonly repo: IntentStore,
    private readonly githubFor: () => Promise<GitHubClient>,
    private readonly git: GitClient,
    private readonly llmFor: (provider: Provider) => Promise<LLMProvider>,
    private readonly modelFor: (workspaceId: string) => Promise<FeatureModelChoice>,
    /** Prompt-assembly telemetry level (config.promptLog); sizes/sources only. */
    private readonly promptLog: PromptLogLevel = 'summary',
  ) {}

  // ===========================================================================
  // Reads
  // ===========================================================================

  /** `GET /pulls/:id/intent` — cached row only, no LLM/GitHub/git calls. */
  async getIntent(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const ctx = await this.repo.getPullContext(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');
    const row = await this.repo.get(prId);
    if (!row) return null;
    return toRecord(prId, row, ctx.pull.headSha);
  }

  // ===========================================================================
  // Derivation
  // ===========================================================================

  /**
   * Best-effort derivation for a review run. `onEvent`, when given, is
   * bridged by the caller into the run's Live Log (source counts/kinds,
   * resolved/unresolved counts, confidence, model, cache hit/miss, tokens,
   * cost — never raw title/body/doc text). Throws on failure; the caller
   * (`ReviewRunExecutor`) is what makes that non-fatal.
   * A stale cached row (head_sha changed) is never returned as-is: the hash
   * includes head_sha, so a stale cache is always a miss and gets re-derived.
   */
  async deriveForReview(workspaceId: string, prId: string, onEvent?: IntentEmit): Promise<PromptIntent> {
    const { row } = await this.derive(workspaceId, prId, { force: false }, onEvent ?? NOOP_EMIT);
    return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope, confidence: row.confidence };
  }

  /** `POST /pulls/:id/intent` — always re-derives (ignores the cache). */
  async deriveIntent(workspaceId: string, prId: string, logger?: IntentLogger): Promise<PrIntentRecord> {
    const { row } = await this.derive(workspaceId, prId, { force: true }, emitFromLogger(logger));
    return toRecord(prId, row, row.headSha ?? '');
  }

  private async derive(
    workspaceId: string,
    prId: string,
    opts: { force: boolean },
    emit: IntentEmit,
  ): Promise<DeriveResult> {
    const key = `${workspaceId}:${prId}`;
    const existing = this.inFlight.get(key);
    if (existing) {
      if (!opts.force || existing.forced) return existing.promise;
      // Forced caller sharing a non-forced (possibly cache-hit) in-flight
      // run: await it first so we never run two model calls for this PR at
      // once, then fall through to start a genuine forced run of our own.
      await existing.promise.catch(() => undefined);
      return this.derive(workspaceId, prId, opts, emit);
    }

    const promise = this.runDerive(workspaceId, prId, opts, emit).finally(() => {
      const cur = this.inFlight.get(key);
      if (cur && cur.promise === promise) this.inFlight.delete(key);
    });
    this.inFlight.set(key, { forced: opts.force, promise });
    return promise;
  }

  private async runDerive(
    workspaceId: string,
    prId: string,
    opts: { force: boolean },
    emit: IntentEmit,
  ): Promise<DeriveResult> {
    const ctx = await this.repo.getPullContext(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');

    const choice = await this.modelFor(workspaceId);
    const candidates = await this.buildCandidates(ctx, emit);

    const signals = candidates.map(candidateSignal);
    const baseConfidence = computeBaseConfidence(signals);
    const anyLinkedUnresolved = candidates.some(
      (c) => c.linked && !c.resolved && (c.kind === 'spec_doc' || c.kind === 'linked_issue'),
    );
    const resolvedCount = candidates.filter((c) => c.resolved).length;
    const kinds = candidates.map((c) => c.kind);
    const detail = { sourceCount: candidates.length, kinds, resolvedCount, unresolvedCount: candidates.length - resolvedCount };

    const promptSources: PromptSourceEntry[] = candidates
      .filter((c): c is Candidate & { prompt: { label: string; content: string } } => c.prompt != null)
      .map((c) => c.prompt);
    const sourceDigests = promptSources.map((s) => s.content);

    const inputHash = computeInputHash({
      model: choice.model,
      title: ctx.pull.title,
      body: ctx.pull.body,
      headSha: ctx.pull.headSha,
      sourceDigests,
    });

    if (!opts.force) {
      const cached = await this.repo.get(prId);
      if (cached && cached.inputHash === inputHash) {
        emit('info', 'intent: derived (cache hit)', {
          prId,
          ...detail,
          confidence: cached.confidence,
          model: cached.model,
          cacheHit: true,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
        });
        return { row: cached, cacheHit: true };
      }
    }

    // Unresolved references are still surfaced to the model (kind + ref +
    // note only, never content) so it can judge evidence_sufficient honestly
    // instead of silently not knowing a reference existed at all.
    const unresolved = candidates.filter((c) => !c.resolved);
    const fitted = fitSourcesToBudget(promptSources, MAX_USER_MESSAGE_CHARS);
    const finalSources: PromptSourceEntry[] =
      unresolved.length > 0
        ? [
            ...fitted,
            {
              label: 'unresolved-refs',
              content: unresolved.map((c) => `${c.kind} ${c.ref}${c.note ? ` (${c.note})` : ''}`).join('; '),
            },
          ]
        : fitted;

    const systemPrompt = buildIntentSystemPrompt();
    const userPrompt = buildIntentUserPrompt(finalSources);
    const promptStats = summarizePrompt(intentPromptSections(systemPrompt, finalSources), this.promptLog);
    if (promptStats) {
      emit('info', `intent prompt assembled: ~${promptStats.est_tokens} tokens`, {
        event: 'prompt.assembled',
        correlation_id: `intent:${randomUUID()}`,
        prId,
        model: choice.model,
        ...promptStats,
      });
    }

    const llm = await this.llmFor(choice.provider);

    let extraction: IntentExtraction;
    let costUsd: number | null;
    let tokensIn: number;
    let tokensOut: number;
    try {
      const result = await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: IntentExtraction,
          schemaName: 'IntentExtraction',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: EXTRACT_TEMPERATURE,
          maxTokens: EXTRACT_MAX_TOKENS,
          timeoutMs: EXTRACT_TIMEOUT_MS,
          maxRetries: EXTRACT_MAX_RETRIES,
        }),
        EXTRACT_TIMEOUT_MS,
      );
      extraction = result.data;
      costUsd = result.costUsd;
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof TimeoutError ? `Intent derivation timed out: ${err.message}` : (err as Error).message;
      throw new ExternalServiceError(msg);
    }

    let clamped;
    try {
      clamped = clampExtraction(extraction);
    } catch (err) {
      throw new ExternalServiceError((err as Error).message);
    }

    const downgradeSteps = (anyLinkedUnresolved ? 1 : 0) + (clamped.evidenceSufficient === false ? 1 : 0);
    const confidence = downgradeConfidence(baseConfidence, downgradeSteps);
    const outOfScope = applyLowConfidenceScopeGuard(confidence, clamped.outOfScope);

    const sources: IntentSource[] = candidates.map((c) => ({
      kind: c.kind,
      ref: c.ref,
      resolved: c.resolved,
      linked: c.linked,
      note: c.note,
    }));
    const values: UpsertIntentValues = {
      intent: clamped.intent,
      inScope: clamped.inScope,
      outOfScope,
      confidence,
      sources,
      provider: choice.provider,
      model: choice.model,
      costUsd,
      tokensIn,
      tokensOut,
      inputHash,
      headSha: ctx.pull.headSha,
    };
    const row = await this.repo.upsert(prId, values);
    emit('info', 'intent: derived', { prId, ...detail, confidence, model: choice.model, cacheHit: false, tokensIn, tokensOut, costUsd });
    return { row, cacheHit: false };
  }

  // ===========================================================================
  // Source resolution (I/O)
  // ===========================================================================

  private async buildCandidates(ctx: IntentPullContext, emit: IntentEmit): Promise<Candidate[]> {
    const { pull, repo, commits, files } = ctx;
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const refs = extractReferences({
      title: pull.title,
      body: pull.body,
      branch: pull.branch,
      repoOwner: repo.owner,
      repoName: repo.name,
    });

    const out: Candidate[] = [];

    // ---- spec docs: linked (explicit) first, then changed-without-link (D8) ----
    for (const path of refs.linkedSpecPaths) {
      out.push(await this.resolveSpecDoc(ref, pull.headSha, path, true, MAX_SPEC_DOC_CHARS));
    }
    const changedPaths = files.map((f) => f.path).slice(0, MAX_CHANGED_PATHS);
    const changedDocs = selectChangedSpecDocs(changedPaths, refs.linkedSpecPaths, MAX_CHANGED_SPEC_DOCS);
    for (const path of changedDocs) {
      out.push(await this.resolveSpecDoc(ref, pull.headSha, path, false, MAX_CHANGED_SPEC_DOC_CHARS));
    }

    // ---- linked issues (same-repo only; cross-repo shorthand → external_ref) ----
    if (refs.linkedIssueNumbers.length > 0) {
      let github: GitHubClient | undefined;
      try {
        github = await this.githubFor();
      } catch (err) {
        emit('info', 'intent: GitHub unavailable — linked issues unresolved', { err: (err as Error).message });
      }
      for (const n of refs.linkedIssueNumbers) {
        out.push(await this.resolveIssue(github, ref, n));
      }
    }

    // ---- title (always present) ----
    const title = pull.title.slice(0, MAX_TITLE_CHARS);
    out.push({
      kind: 'title',
      ref: `#${pull.number}`,
      linked: true,
      resolved: true,
      note: null,
      prompt: { label: 'pr-title', content: title },
    });

    // ---- description (medium confidence only when substantive) ----
    if (pull.body && pull.body.trim().length > 0) {
      const content = pull.body.slice(0, MAX_DESCRIPTION_CHARS);
      const substantive = countSubstantiveWords(pull.body) >= MIN_DESCRIPTION_WORDS;
      out.push({
        kind: 'description',
        ref: 'body',
        linked: true,
        resolved: substantive,
        note: null,
        prompt: { label: 'pr-description', content },
      });
    }

    // ---- branch ticket (D9) ----
    if (refs.branchTicket) {
      out.push({
        kind: 'branch_ticket',
        ref: `branch: ${pull.branch}`,
        linked: true,
        resolved: true,
        note: null,
        prompt: { label: 'branch', content: `branch: ${pull.branch} (ticket ${refs.branchTicket})` },
      });
    }

    // ---- commit messages ----
    if (commits.length > 0) {
      const content = commits
        .slice(0, MAX_COMMIT_MESSAGE_LINES)
        .map((c) => `- ${c.message.split('\n')[0]}`)
        .join('\n')
        .slice(0, MAX_COMMIT_MESSAGES_CHARS);
      out.push({
        kind: 'commit_messages',
        ref: `${commits.length} commit(s)`,
        linked: true,
        resolved: true,
        note: null,
        prompt: { label: 'commits', content },
      });
    }

    // ---- changed paths (+ a one-line diff-stat summary) ----
    if (files.length > 0) {
      const totalAdd = files.reduce((n, f) => n + f.additions, 0);
      const totalDel = files.reduce((n, f) => n + f.deletions, 0);
      const statLine = `+${totalAdd}/-${totalDel}, ${files.length} file(s)`;
      out.push({
        kind: 'changed_paths',
        ref: `${files.length} file(s)`,
        linked: true,
        resolved: true,
        note: null,
        prompt: { label: 'changed-paths', content: `${statLine}\n${changedPaths.join('\n')}` },
      });
    }

    // ---- external refs (Q1: recorded, never fetched) ----
    for (const extRef of refs.externalRefs) {
      out.push({ kind: 'external_ref', ref: extRef, linked: true, resolved: false, note: 'external_not_fetched' });
    }

    return out;
  }

  private async resolveSpecDoc(
    ref: RepoRef,
    headSha: string,
    path: string,
    linked: boolean,
    maxChars: number,
  ): Promise<Candidate> {
    const short = headSha.slice(0, 7);
    try {
      // The byte cap is enforced by the git adapter itself (a blob-size check
      // BEFORE reading), not applied to an already-fully-read file here.
      const raw = await this.git.showFileAt(ref, headSha, path, MAX_SPEC_DOC_READ_BYTES);
      const capped = raw.slice(0, maxChars);
      return {
        kind: 'spec_doc',
        ref: `${path}@${short}`,
        linked,
        resolved: true,
        note: null,
        prompt: { label: `spec:${path}`, content: capped },
      };
    } catch (err) {
      const note = err instanceof BlobTooLargeError ? 'too_large' : 'not_found';
      return { kind: 'spec_doc', ref: `${path}@${short}`, linked, resolved: false, note };
    }
  }

  private async resolveIssue(github: GitHubClient | undefined, ref: RepoRef, n: number): Promise<Candidate> {
    if (!github) {
      return { kind: 'linked_issue', ref: `#${n}`, linked: true, resolved: false, note: 'github_unavailable' };
    }
    try {
      const issue = await github.getIssue(ref, n);
      const content = `${issue.title}\n${issue.body ?? ''}`.trim().slice(0, MAX_ISSUE_CHARS);
      return {
        kind: 'linked_issue',
        ref: `#${n}`,
        linked: true,
        resolved: true,
        note: null,
        prompt: { label: `issue:#${n}`, content },
      };
    } catch {
      return { kind: 'linked_issue', ref: `#${n}`, linked: true, resolved: false, note: 'not_found' };
    }
  }
}

function toRecord(prId: string, row: IntentRow, currentHeadSha: string): PrIntentRecord {
  return {
    pr_id: prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence,
    sources: row.sources,
    provider: row.provider,
    model: row.model,
    cost_usd: row.costUsd,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    head_sha: row.headSha,
    stale: row.headSha !== currentHeadSha,
    derived_at: row.updatedAt.toISOString(),
  };
}

/**
 * Prompt-log sections for the extraction call, grouped by source KIND — the
 * label prefix (`spec`, `issue`, `pr-description`, …) — never the full label,
 * which can carry a spec path or ref. Content is measured, never emitted.
 */
function intentPromptSections(systemPrompt: string, sources: PromptSourceEntry[]): SectionInput[] {
  const groups = new Map<string, string[]>();
  for (const src of sources) {
    const kind = src.label.split(':')[0]!;
    groups.set(kind, [...(groups.get(kind) ?? []), src.content]);
  }
  return [
    { section: 'system', source: 'intent-layer', trust: 'trusted', content: systemPrompt },
    ...[...groups].map(
      ([kind, items]): SectionInput => ({
        section: kind,
        source: 'pr-context',
        trust: 'untrusted',
        content: items.join('\n'),
        items,
      }),
    ),
  ];
}
