import type { GitClient, LLMProvider, Provider as ProviderId, RunEventKind, SkillSource } from '@devdigest/shared';
import type { RunBus } from '../../platform/sse.js';
import type { RepoIntel } from '../repo-intel/types.js';
import type {
  Provider,
  ProjectContextSkipReason,
  ProjectContextTrace,
  Review,
  RunTrace,
  UnifiedDiff,
} from '@devdigest/shared';
import {
  reviewPullRequest,
  countBlockers,
  fitProjectContext,
  renderProjectContext,
  selectReviewMode,
  type ProjectDoc,
  type PromptIntent,
  type PromptLogLevel,
} from '@devdigest/reviewer-core';
import { RunLogger, toRunLogLines } from '../../platform/run-logger.js';
import * as schema from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { REVIEW_STRATEGY } from './constants.js';
import { taskLine, toSkillBlock } from './helpers.js';
import { loadDiff } from './diff-loader.js';
import type { ProjectContextForRun } from '../context-attachments/types.js';
import { formatContextLine, touchedByDiff } from '../context-attachments/helpers.js';

/** One skill linked to a review agent, resolved for prompt assembly. */
export interface PromptSkill {
  id: string;
  name: string;
  body: string;
  source: SkillSource;
}

/**
 * Port the executor needs to resolve an agent's linked skills into prompt-
 * ready bodies. `SkillsRepository` satisfies this; the executor takes the
 * interface, not the repository class (`service-takes-ports-not-container`).
 */
export interface SkillsReader {
  forAgent(agentId: string): Promise<PromptSkill[]>;
}

/**
 * Port the executor needs to (best-effort) derive a PR's intent before review.
 * `IntentService` satisfies this; the executor takes the interface, not the
 * service class (service-takes-ports-not-container).
 *
 * May THROW (PR/repo missing, GitHub/git/LLM error, empty model output) — it
 * is the EXECUTOR's `try/catch` around the call (see `executeRuns`) that makes
 * derivation non-fatal, not this port swallowing errors itself; if it did,
 * the "Intent unavailable — continuing without it" Live Log line could never
 * fire. `onEvent`, when given, receives progress/observability detail (source
 * counts/kinds, resolved/unresolved counts, confidence, model, cache hit/miss,
 * tokens, cost) — NEVER raw title/body/doc text.
 */
export interface IntentDeriver {
  deriveForReview(
    workspaceId: string,
    prId: string,
    onEvent?: (kind: RunEventKind, msg: string, data?: unknown) => void,
  ): Promise<PromptIntent>;
}

/**
 * What `buildProjectContext` fixed for one run: the documents handed to the engine (after the
 * 48,000-char safeguard) and the trace block. `kept` is empty and `trace` null when the agent
 * has nothing to inject or resolution was unavailable.
 */
interface ProjectContextState {
  kept: ProjectDoc[];
  trace: ProjectContextTrace | null;
}

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/**
 * Owns the background execution of queued agent runs (extracted from
 * ReviewService; behaviour unchanged). Loads the diff + intent once, then
 * map-reduces each agent, streaming events over the runBus and persisting each
 * review. Per-agent failures are isolated.
 */
export class ReviewRunExecutor {
  /** Ports, not the container: the run loop needs exactly these seven. */
  constructor(
    private repo: ReviewRepository,
    private runBus: RunBus,
    private llm: (provider: ProviderId) => Promise<LLMProvider>,
    private repoIntel: RepoIntel,
    private git: GitClient,
    private skills: SkillsReader,
    private intent: IntentDeriver,
    /** Project Context attachments resolved once per run (git objects at the scanned sha). */
    private projectContext: ProjectContextForRun,
    /** Prompt-assembly telemetry level (config.promptLog); sizes/sources only. */
    private promptLog: PromptLogLevel = 'summary',
  ) {}

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then map-reduces each agent, streaming events
   * over the runBus and persisting each review. Per-agent failures are isolated.
   */
  async executeRuns(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    jobs: { agent: AgentRow; runId: string }[],
    logger?: Logger,
    /**
     * `parallel` runs the jobs concurrently (multi-agent group); the default
     * keeps the sequential loop used by `agentId` / `all`. `groupId` is only
     * used for the one group-level log line.
     */
    opts?: { parallel?: boolean; groupId?: string },
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const runLog = new RunLogger(
      this.runBus,
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id },
    );

    // Pre-work failure (e.g. diff load) fails EVERY queued run. The error was
    // already emitted via runLog (fanned out → in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId, agent } of jobs) {
        await this.repo
          .completeAgentRun(runId, {
            status: 'failed',
            durationMs: 0,
            tokensIn: 0,
            tokensOut: 0,
            costUsd: null,
            findingsCount: 0,
            grounding: '0/0 passed',
            error: msg,
          })
          .catch(() => undefined);
        await this.repo
          .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed'))
          .catch(() => undefined);
        this.runBus.complete(runId);
      }
    };

    let diff: UnifiedDiff;
    try {
      diff = await runLog.step('Loading PR diff', () => loadDiff(this.git, this.repo, workspaceId, pull, repo), {
        kind: 'tool',
      });
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    // Intent Layer — shared pre-work, like the diff above. NEVER fails the
    // run: any error degrades to "no intent" rather than aborting. `onEvent`
    // bridges the service's own detail (source counts/kinds, confidence,
    // cache hit/miss, tokens, cost) straight into this run's Live Log +
    // stdout mirror + persisted trace, the same way `reviewPullRequest`'s own
    // `onEvent` does in `runOneAgent` below.
    let intent: PromptIntent | undefined;
    try {
      intent = await runLog.step(
        'Deriving PR intent',
        () => this.intent.deriveForReview(workspaceId, pull.id, (kind, msg, data) => runLog.event(kind, msg, data)),
        { kind: 'tool' },
      );
    } catch (err) {
      runLog.info(`Intent unavailable — continuing without it: ${(err as Error).message}`);
      logger?.warn({ prId: pull.id, err: (err as Error).message }, 'intent: derivation failed');
    }

    // Per-job state lives only in this closure and in `runLog.forRun(runId)`
    // (inside runOneAgent) — nothing shared between concurrently running jobs.
    const runJob = async ({
      agent,
      runId,
    }: {
      agent: AgentRow;
      runId: string;
    }): Promise<'done' | 'failed' | 'cancelled'> => {
      const agentStart = Date.now();
      logger?.info(
        { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
        `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
      );
      try {
        const outcome = await this.runOneAgent(
          workspaceId,
          pull,
          repo,
          diff,
          agent,
          runId,
          runLog,
          intent,
          logger,
        );
        logger?.info(
          {
            runId,
            agent: agent.name,
            findings: outcome.findings.length,
            grounding: outcome.grounding,
            durationMs: Date.now() - agentStart,
          },
          `review: agent "${agent.name}" done — ${outcome.findings.length} finding(s)`,
        );
        return 'done';
      } catch (err) {
        // runOneAgent already persisted the failure/cancel (status + error +
        // trace) and completed the bus; here we only log at the run level.
        const cancelled = err instanceof RunCancelledError;
        logger?.[cancelled ? 'info' : 'error'](
          { runId, agent: agent.name, err: (err as Error).message, durationMs: Date.now() - agentStart },
          `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
        );
        return cancelled ? 'cancelled' : 'failed';
      }
    };

    if (!opts?.parallel) {
      for (const job of jobs) await runJob(job);
      return;
    }

    // Multi-agent group: every member runs at once; each job catches its own
    // error, and allSettled guarantees one member can never reject the batch.
    const settled = await Promise.allSettled(jobs.map(runJob));
    logger?.info(
      {
        multiAgentRunId: opts.groupId ?? null,
        runs: jobs.map((j, i) => {
          const r = settled[i]!;
          return { runId: j.runId, status: r.status === 'fulfilled' ? r.value : 'failed' };
        }),
      },
      'review: group finished',
    );
  }

  /** Execute a single agent's review against a PR, streaming progress. */
  private async runOneAgent(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
    agent: AgentRow,
    runId: string,
    parentLog: RunLogger,
    intent: PromptIntent | undefined,
    logger?: Logger,
  ): Promise<RunOutcome> {
    const start = Date.now();
    // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
    // events are already in this run's buffer, so the persisted trace below
    // (built from the buffer) includes them too.
    const runLog = parentLog.forRun(runId, { agent: agent.name });

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

    // Set as the run progresses so the failure/cancel trace records only what really happened:
    // `projectContext` once resolution ran, `engineEntered` right before the engine is called.
    let projectContext: ProjectContextState | undefined;
    let engineEntered = false;

    try {
      // Resolve the agent's LLM provider. (container.llm throws if the provider
      // key is missing — caught below and persisted as a failed run.)
      const llm = await runLog.step(
        `Resolving ${agent.provider} provider`,
        () => this.llm(agent.provider as Provider),
        { kind: 'tool' },
      );

      // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
      // skip all enrichment entirely so its prompt is identical to the
      // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
      // flag, which still gates the facade internally.
      const repoIntelOn = agent.repoIntel !== false;
      if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');

      // T1.3 — callers-in-prompt. Best-effort: when repo-intel is off the facade
      // returns []; we omit the section and behavior is identical to the
      // pre-T1.3 prompt (acceptance #10).
      const callersDigest = repoIntelOn
        ? await this.buildCallersDigest(pull.repoId, diff, runLog)
        : undefined;

      // T3 — repo skeleton + "changed files are top-5%" framing. Both best-
      // effort: when repo-intel is off / unindexed the facade degrades and the
      // prompt is identical to the pre-T3 shape.
      const repoMap = repoIntelOn ? await this.buildRepoMapDigest(pull.repoId, runLog) : undefined;
      const rankNote = repoIntelOn ? await this.buildRankNote(pull.repoId, diff, runLog) : '';

      const task = taskLine(pull) + rankNote;

      // L02 — the agent's linked, enabled skills, resolved to prompt-ready
      // bodies (and their ids, for the trace's pull-frequency stat).
      const linkedSkills = await this.buildSkillBlocks(agent.id, runLog);
      const skillBlocks = linkedSkills.map((s) => s.block);

      // Project Context — resolved ONCE here (list and SHA fixed for the whole run), before the
      // first LLM call. Never throws; on any failure the run continues without the block.
      projectContext = await this.buildProjectContext(
        workspaceId,
        pull,
        agent,
        linkedSkills,
        diff,
        runLog,
        logger,
      );

      // ---- Engine: assemble → single-pass → grounding -----------------------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, and persistence + observability below.
      engineEntered = true;
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        // Per-agent review strategy (configured in the Agent editor); falls back
        // to the studio default. single-pass = whole diff in one call.
        strategy: agent.strategy ?? REVIEW_STRATEGY,
        // T1.3 — pass the callers digest only when we built one. assemblePrompt
        // omits the section when this is empty/undefined.
        ...(callersDigest ? { callers: callersDigest } : {}),
        // T3 — repo skeleton, same omit-when-empty contract.
        ...(repoMap ? { repoMap } : {}),
        // PR author's description/body — untrusted; assemblePrompt wraps +
        // truncates it. Omitted when the PR has no body.
        ...(pull.body ? { prDescription: pull.body } : {}),
        // Intent Layer — derived once, shared across every queued agent run.
        // Omitted when derivation failed/was skipped (never blocks the review).
        ...(intent ? { intent } : {}),
        // L02 — the agent's linked skills, in `agent_skills.order`. Omitted
        // when the agent has none linked (or none enabled), same
        // omit-when-empty contract as callers/repoMap above.
        ...(skillBlocks.length ? { skills: skillBlocks } : {}),
        // Project Context — only when at least one document survived; otherwise the prompt is
        // byte-identical to the no-attachments baseline.
        ...(projectContext.kept.length ? { specs: projectContext.kept } : {}),
        task,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        // Joins every `prompt.assembled` event to this run's trace + Live Log.
        correlationId: runId,
        promptLog: this.promptLog,
        onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
        checkCancelled: () => {
          if (this.runBus.isCancelled(runId)) throw new RunCancelledError();
        },
      });
      const { tokensIn, tokensOut, costUsd, grounding } = outcome;

      const keptFindings = outcome.review.findings;

      // ---- Persist review + findings (one transaction) -----------------------
      // Atomic on purpose: a review row that lands without its findings reads
      // as "this run found nothing" everywhere in the UI.
      const { review, findings: findingRows } = await this.repo.insertReviewWithFindings(
        {
          workspaceId,
          prId: pull.id,
          agentId: agent.id,
          runId,
          kind: 'review',
          verdict: outcome.review.verdict,
          summary: outcome.review.summary,
          score: outcome.review.score,
          model: agent.model,
        },
        keptFindings,
      );
      runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

      // Mark the commit this review ran against so the PR list can tell
      // reviewed / needs-review (head moved) / stale apart.
      await this.repo.markReviewed(pull.id, pull.headSha);

      const durationMs = Date.now() - start;

      // Deterministic blocker count (severity ≥ the agent's gate) — the signal
      // the timeline colors on, NOT the model's self-reported verdict.
      const blockers = countBlockers(keptFindings, agent.ciFailOn);

      // ---- Observability: agent_runs + ONE run_traces document --------------
      const trace: RunTrace = {
        config: {
          agent: agent.name,
          version: String(agent.version),
          provider: agent.provider,
          model: agent.model,
          pr: pull.number,
          source: 'local',
          // Skill ids actually injected into THIS run's prompt — backs a
          // skill's pull-frequency stat (a real query over runs recorded
          // since this field started being written, not an estimate).
          skills: linkedSkills.map((s) => s.id),
        },
        stats: {
          duration_ms: durationMs,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: costUsd,
          findings: findingRows.length,
          grounding,
        },
        prompt_assembly: outcome.assembly,
        tool_calls: outcome.chunks.map((c) => ({
          tool: 'review_file',
          args: c.label,
          meta: outcome.mode,
          ms: Math.round(durationMs / Math.max(outcome.chunks.length, 1)),
        })),
        raw_output: outcome.raw,
        memory_pulled: [],
        specs_read: projectContext.kept.map((d) => d.path),
        project_context: projectContext.trace,
        // Persisted log = the run's FULL event buffer (incl. shared pre-work:
        // diff load + intent), not just events recorded inside this method.
        log: runLog.logFor(runId),
      };
      runLog.info('Run complete; trace persisted');
      await this.repo.saveRunTrace(runId, trace);
      // Publish terminal status only after its trace exists. Clients and tests
      // read the trace as soon as they observe `done`.
      await this.repo.completeAgentRun(runId, {
        status: 'done',
        durationMs,
        tokensIn,
        tokensOut,
        costUsd,
        findingsCount: findingRows.length,
        grounding,
        score: outcome.review.score,
        blockers,
        error: null,
      });
      this.runBus.complete(runId);

      return { review, findings: findingRows, grounding, raw: outcome.review };
    } catch (err) {
      // Failure/cancel: persist status + the error text + the log-so-far so the
      // run (and WHY it failed) is visible on the UI after a reload.
      const cancelled = err instanceof RunCancelledError;
      const status = cancelled ? 'cancelled' : 'failed';
      const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
      runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
      await this.repo
        .completeAgentRun(runId, {
          status,
          durationMs: Date.now() - start,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: null,
          findingsCount: 0,
          grounding: '0/0 passed',
          error: msg,
        })
        .catch(() => undefined);
      await this.repo
        .saveRunTrace(
          runId,
          this.traceFromBuffer(
            runId,
            pull,
            agent,
            '0/0 passed',
            Date.now() - start,
            projectContext && {
              specsRead: projectContext.kept.map((d) => d.path),
              projectContext: projectContext.trace,
              // The block exists in a prompt only if the engine was entered (EC-21).
              specsBlock:
                engineEntered && projectContext.kept.length > 0 ? renderProjectContext(projectContext.kept) : null,
            },
          ),
        )
        .catch(() => undefined);
      this.runBus.complete(runId);
      throw err;
    }
  }

  /**
   * Resolve the agent's linked, enabled skills into prompt-ready blocks.
   *
   * Trust is per source: a `manual` skill is the workspace's own instruction
   * (rendered raw, same as the agent's system prompt); anything imported is
   * wrapped in `<untrusted>` so `INJECTION_GUARD` covers it too — an imported
   * skill is someone else's instructions in the prompt, so it gets the same
   * treatment as the diff, not the same trust as a hand-written rubric.
   * Best-effort: a failure here returns `[]`, leaving the prompt identical to
   * the no-skills baseline (never breaks the run).
   */
  private async buildSkillBlocks(
    agentId: string,
    runLog: RunLogger,
  ): Promise<Array<{ id: string; name: string; block: string }>> {
    let linked: PromptSkill[];
    try {
      linked = await this.skills.forAgent(agentId);
    } catch (err) {
      runLog.info(`skills: lookup failed — ${(err as Error).message}`);
      return [];
    }
    if (linked.length === 0) return [];

    const resolved = linked.map((s) => ({
      id: s.id,
      name: s.name,
      block: toSkillBlock(s),
    }));
    runLog.info(`Attached ${resolved.length} skill(s): ${linked.map((s) => s.name).join(', ')}`);
    return resolved;
  }

  /**
   * Resolve the Project Context block for this run and write its Live Log lines (before the
   * first LLM call). The catalog port is asked once; the 48,000-char safeguard is applied here
   * and anything it drops is recorded in the trace as `skipped` / `over_budget`.
   *
   * Live Log and logger carry paths, sizes, estimates and reasons — never document text or a
   * secret value. Any throw is logged and degrades to "no block" (the run is never failed).
   */
  private async buildProjectContext(
    workspaceId: string,
    pull: PullRow,
    agent: AgentRow,
    linkedSkills: Array<{ id: string; name: string }>,
    diff: UnifiedDiff,
    runLog: RunLogger,
    logger?: Logger,
  ): Promise<ProjectContextState> {
    const none: ProjectContextState = { kept: [], trace: null };
    try {
      const result = await this.projectContext.resolveForRun(
        {
          workspaceId,
          agentId: agent.id,
          repoId: pull.repoId,
          injectedSkills: linkedSkills.map((s) => ({ id: s.id, name: s.name })),
        },
        logger,
      );
      if (result.kind === 'unavailable') {
        runLog.info(`Project context unavailable: ${result.reason}`);
        return none;
      }
      if (result.kind === 'none') {
        runLog.info(formatContextLine({ n: 0, tokens: 0, skipped: {}, calls: 1 }));
        return none;
      }

      const { kept, dropped } = fitProjectContext(result.docs);
      const droppedPaths = new Set(dropped.map((d) => d.path));
      const docs = result.trace.docs.map((d) =>
        d.status === 'injected' && droppedPaths.has(d.path)
          ? { ...d, status: 'skipped' as const, reason: 'over_budget' as const }
          : d,
      );
      const droppedTokens = result.trace.docs.reduce(
        (sum, d, i) => (docs[i] !== d ? sum + (d.est_tokens ?? 0) : sum),
        0,
      );
      const trace: ProjectContextTrace = {
        ...result.trace,
        total_est_tokens: Math.max(0, result.trace.total_est_tokens - droppedTokens),
        docs,
      };

      const skipped: Partial<Record<ProjectContextSkipReason, number>> = {};
      for (const d of docs) if (d.reason) skipped[d.reason] = (skipped[d.reason] ?? 0) + 1;
      // Map-reduce repeats the block in every per-file call (NFR-2).
      const calls =
        kept.length > 0 && selectReviewMode(agent.strategy ?? REVIEW_STRATEGY, diff) === 'map-reduce'
          ? diff.files.length
          : 1;
      runLog.info(formatContextLine({ n: kept.length, tokens: trace.total_est_tokens, skipped, calls }));

      const keptPaths = kept.map((d) => d.path);
      for (const path of touchedByDiff(diff.files.map((f) => f.path), keptPaths)) {
        runLog.info(
          `Project context: ${path} is also changed by this PR — the model sees the default-branch version`,
        );
      }
      for (const path of result.secretPaths) {
        if (keptPaths.includes(path)) {
          runLog.info(`Project context: ${path} may contain a secret — it is injected as attached`);
        }
      }
      if (result.allReadsFailed) runLog.info('Project context: no attached document could be read');
      return { kept, trace };
    } catch (err) {
      runLog.info(`Project context failed — continuing without it: ${(err as Error).message}`);
      logger?.warn({ prId: pull.id, agentId: agent.id, err: (err as Error).message }, 'project context: failed');
      return none;
    }
  }

  /**
   * Build a compact "Callers of changed symbols" digest for the prompt.
   *
   * Returns `undefined` when nothing should be added (flag off, no callers
   * found, or repo-intel errors) — `reviewPullRequest` omits the section in
   * that case (acceptance #10: flag off → identical prompt).
   *
   * Compact format: one bullet per caller, grouped by file. Trimmed (limit 10
   * rows per `getCallerSignatures` call) so the section stays under ~600
   * tokens even on heavy PRs.
   */
  private async buildCallersDigest(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return undefined;
    let rows;
    try {
      rows = await this.repoIntel.getCallerSignatures(repoId, changedFiles, 10);
    } catch (err) {
      // Never let an enrichment break the run — surface only as a Live Log info.
      runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
    if (rows.length === 0) return undefined;

    const byFile = new Map<string, string[]>();
    for (const r of rows) {
      const lines = byFile.get(r.file) ?? [];
      lines.push(`- \`${r.symbol}\` — ${r.signature}`);
      byFile.set(r.file, lines);
    }
    const out: string[] = [];
    for (const [file, lines] of byFile) {
      out.push(`### ${file}`);
      out.push(...lines);
    }
    runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return out.join('\n');
  }

  /**
   * T3 — fetch the cached repo skeleton for the prompt's `## Repo skeleton`
   * slot. Returns `undefined` when repo-intel is off / the repo isn't indexed
   * (the facade degrades), so the prompt stays identical to the pre-T3 shape.
   */
  private async buildRepoMapDigest(
    repoId: string,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    try {
      const map = await this.repoIntel.getRepoMap(repoId);
      if (map.degraded || map.text.trim().length === 0) return undefined;
      runLog.info(`repo map: ${map.tokens} token(s) attached (cached=${map.cached})`);
      return map.text;
    } catch (err) {
      runLog.info(`repo map: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * T3 — a one-line "N of M changed files are in the top 5% most-depended-on"
   * note appended to the task framing, so the model prioritises hot core files.
   * Empty string when repo-intel is off / no changed file is hot.
   */
  private async buildRankNote(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return '';
    try {
      const ranks = await this.repoIntel.getFileRank(repoId, changedFiles);
      if (ranks.length === 0) return '';
      const hot = ranks.filter((r) => r.percentile >= 95);
      if (hot.length === 0) return '';
      runLog.info(`file rank: ${hot.length}/${changedFiles.length} changed file(s) in top 5%`);
      return `\n\n${hot.length} of ${changedFiles.length} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`;
    } catch {
      return '';
    }
  }

  /**
   * A minimal RunTrace whose `log` is the run's full SSE buffer — persisted on
   * failure/cancel (and pre-work failures) so the events (and WHY it failed)
   * survive a reload, not just the in-memory stream.
   */
  private traceFromBuffer(
    runId: string,
    pull: PullRow,
    agent: AgentRow,
    grounding: string,
    durationMs = 0,
    extras?: { specsRead: string[]; projectContext: ProjectContextTrace | null; specsBlock: string | null },
  ): RunTrace {
    return {
      config: {
        agent: agent.name,
        version: String(agent.version),
        provider: agent.provider,
        model: agent.model,
        pr: pull.number,
        source: 'local',
      },
      stats: { duration_ms: durationMs, tokens_in: 0, tokens_out: 0, cost_usd: null, findings: 0, grounding },
      prompt_assembly: {
        system: agent.systemPrompt,
        skills: null,
        memory: null,
        specs: extras?.specsBlock ?? null,
        user: '',
      },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: extras?.specsRead ?? [],
      project_context: extras?.projectContext ?? null,
      log: toRunLogLines(this.runBus.buffer(runId)),
    };
  }
}
