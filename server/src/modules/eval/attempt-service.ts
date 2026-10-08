/**
 * Eval review with FIXED inputs (`runEvalReview`) and the in-memory
 * `EvalAttemptService` behind "Run case" (L06). An attempt writes nothing to
 * the DB (AC-39); the suite run reuses `runEvalReview` per case.
 *
 * Untrusted content (diff, PR title and body) reaches the prompt only through
 * the engine's `diff` / `prDescription` channels, and is never logged (NFR-14).
 */
import { randomUUID } from 'node:crypto';
import type {
  EvalAttempt,
  EvalCaseInput,
  EvalCaseResult,
  EvalErrorReason,
  Finding,
} from '@devdigest/shared';
import { reviewPullRequest, type ReviewOutcome, type ReviewStrategy } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { sentTemperature } from '../../platform/llm-params.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { toSkillBlock } from '../reviews/helpers.js';
import {
  ATTEMPT_TTL_MS,
  CASE_TIMEOUT_MS,
  EVAL_TASK_LINE,
  EVAL_TEMPERATURE,
  HTTP_RETRIES,
  LLM_BUDGET_MS,
  STRUCTURED_RETRIES,
} from './constants.js';
import { scoreCase } from './helpers.js';
import type {
  CaseOutcome,
  CaseResultRecord,
  EvalAgent,
  EvalAgentReader,
  EvalLlmResolver,
  EvalLogger,
  EvalPinnedSkill,
  EvalSkillsReader,
  EvalStore,
  PinnedCase,
  PinnedConfig,
} from './types.js';

/** Hard cap on retained attempts, on top of the TTL. */
const MAX_ATTEMPTS = 500;

/** Freeze the agent configuration (and its skills) for one attempt / suite run. */
export function pinConfig(agent: EvalAgent, skills: EvalPinnedSkill[]): PinnedConfig {
  return {
    agent_id: agent.id,
    agent_version: agent.version,
    provider: agent.provider,
    model: agent.model,
    strategy: agent.strategy,
    system_prompt: agent.system_prompt,
    skills,
    temperature: sentTemperature(agent.provider, agent.model, EVAL_TEMPERATURE),
  };
}

export function pinCaseFromInput(input: EvalCaseInput): PinnedCase {
  return {
    id: null,
    name: input.name,
    type: input.type,
    input_diff: input.input_diff,
    input_meta: input.input_meta,
    expectations: input.expectations,
  };
}

/** What one scored eval review yields. */
export interface EvalReviewResult {
  result: EvalCaseResult;
  /** The value stored in `eval_runs.status` (`timeout` is distinct there). */
  record_status: CaseResultRecord['status'];
  /** Input of `aggregate`. */
  outcome: CaseOutcome;
  /** The LLM request actually sent; `null` when the call never happened. */
  request: ReviewOutcome['request'] | null;
}

export interface EvalReviewDeps {
  resolveLlm: EvalLlmResolver;
}

/** Shared deadline state: once `abandoned`, nothing may write this case's result. */
interface Deadline {
  abandoned: boolean;
  deadlineAt: number;
}

function errorReason(err: unknown): EvalErrorReason {
  if (err instanceof ConfigError) return 'missing_key';
  if (err instanceof TimeoutError) return 'timeout';
  const e = err as { name?: string; message?: string } | null;
  const msg = e?.message ?? '';
  if (/timed? ?out|timeout/i.test(`${e?.name ?? ''} ${msg}`)) return 'timeout';
  if (/schema validation|structured output|invalid json|unparseable/i.test(msg)) {
    return 'invalid_output';
  }
  return 'provider_error';
}

/**
 * ONE engine call with fixed inputs: the pinned agent config, the case diff and
 * the PR title/body (untrusted). No callers / repo map / intent / specs /
 * memory (AC-18, AC-19). Never throws: every failure becomes an `error` result
 * with a reason code (AC-46, AC-161).
 */
export async function runEvalReview(
  deps: EvalReviewDeps,
  config: PinnedConfig,
  c: PinnedCase,
): Promise<EvalReviewResult> {
  const started = Date.now();
  const state: Deadline = { abandoned: false, deadlineAt: started + CASE_TIMEOUT_MS };
  const done = (
    kept: Finding[],
    dropped: ReviewOutcome['dropped'],
    reason: EvalErrorReason | null,
    cost: number | null,
    request: ReviewOutcome['request'] | null,
  ): EvalReviewResult => {
    const score = scoreCase(c.type, c.expectations, kept, dropped, reason);
    const duration_ms = Date.now() - started;
    const result: EvalCaseResult = {
      case_id: c.id,
      case_name: c.name,
      status: score.status,
      error_reason: score.error_reason,
      actual_findings: kept.map((f, i) => ({ ...f, match: score.matches[i] ?? 'unmatched' })),
      dropped_findings: dropped,
      expected_count: score.expected_count,
      actual_count: score.actual_count,
      duration_ms,
      cost_usd: cost,
    };
    return {
      result,
      record_status: reason === 'timeout' ? 'timeout' : score.status,
      outcome: { ...score, type: c.type, cost_usd: cost, duration_ms },
      request,
    };
  };

  try {
    const llm = await deps.resolveLlm(config.provider);
    const diff = parseUnifiedDiff(c.input_diff);
    const title = c.input_meta.pr_title;
    const body = c.input_meta.pr_body;
    const outcome = await withTimeout(
      reviewPullRequest({
        systemPrompt: config.system_prompt,
        model: config.model,
        strategy: config.strategy as ReviewStrategy,
        skills: config.skills.map(toSkillBlock),
        diff,
        llm,
        prDescription: body ? `Title: ${title}\n\n${body}` : `Title: ${title}`,
        task: EVAL_TASK_LINE,
        ...(config.temperature !== null ? { temperature: config.temperature } : {}),
        timeoutMs: LLM_BUDGET_MS,
        httpRetries: HTTP_RETRIES,
        maxRetries: STRUCTURED_RETRIES,
        // Stops a map-reduce run from issuing further chunk calls once abandoned.
        checkCancelled: () => {
          if (state.abandoned) throw new TimeoutError(CASE_TIMEOUT_MS);
        },
      }),
      CASE_TIMEOUT_MS,
    );
    if (state.abandoned || Date.now() > state.deadlineAt) {
      return done([], [], 'timeout', null, null);
    }
    return done(outcome.review.findings, outcome.dropped, null, outcome.costUsd, outcome.request);
  } catch (err) {
    state.abandoned = true;
    return done([], [], errorReason(err), null, null);
  }
}

interface AttemptEntry {
  workspaceId: string;
  status: EvalAttempt['status'];
  started_at: string;
  result: EvalCaseResult | null;
  expiresAt: number;
}

/** In-memory "Run case" attempts. Memoized in the container (INSIGHTS:51). */
export class EvalAttemptService {
  private readonly attempts = new Map<string, AttemptEntry>();

  constructor(
    private readonly store: EvalStore,
    private readonly agents: EvalAgentReader,
    private readonly skills: EvalSkillsReader,
    private readonly resolveLlm: EvalLlmResolver,
    private readonly logger: EvalLogger,
    private readonly now: () => number = Date.now,
  ) {}

  /** Run a draft / edited case against the agent's CURRENT configuration. */
  async start(
    workspaceId: string,
    agentId: string,
    input: EvalCaseInput,
  ): Promise<{ attempt_id: string }> {
    return this.launch(workspaceId, agentId, pinCaseFromInput(input));
  }

  /** Re-run a saved case (AC-67). */
  async startForCase(workspaceId: string, caseId: string): Promise<{ attempt_id: string }> {
    const saved = await this.store.getCase(workspaceId, caseId);
    if (!saved) throw new NotFoundError('Eval case not found');
    return this.launch(workspaceId, saved.owner_id, {
      id: saved.id,
      name: saved.name,
      type: saved.type,
      input_diff: saved.input_diff,
      input_meta: saved.input_meta,
      expectations: saved.expectations,
    });
  }

  get(workspaceId: string, attemptId: string): EvalAttempt {
    this.purge();
    const entry = this.attempts.get(attemptId);
    if (!entry || entry.workspaceId !== workspaceId) {
      throw new AppError('attempt_not_found', 'Attempt not found or expired', 404);
    }
    return {
      attempt_id: attemptId,
      status: entry.status,
      started_at: entry.started_at,
      result: entry.result,
    };
  }

  private async launch(
    workspaceId: string,
    agentId: string,
    pinnedCase: PinnedCase,
  ): Promise<{ attempt_id: string }> {
    const agent = await this.agents.get(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const config = pinConfig(agent, await this.skills.forAgentWithVersion(agent.id));

    this.purge();
    const attemptId = randomUUID();
    const entry: AttemptEntry = {
      workspaceId,
      status: 'running',
      started_at: new Date(this.now()).toISOString(),
      result: null,
      expiresAt: this.now() + ATTEMPT_TTL_MS,
    };
    this.attempts.set(attemptId, entry);

    void runEvalReview({ resolveLlm: this.resolveLlm }, config, pinnedCase)
      .then((r) => {
        entry.result = r.result;
        entry.status = r.result.status === 'error' ? 'error' : 'done';
        this.logger.info(
          { attempt_id: attemptId, agent_id: agentId, status: r.result.status, duration_ms: r.result.duration_ms },
          'eval attempt finished',
        );
      })
      .catch((err: unknown) => {
        entry.status = 'error';
        this.logger.error({ attempt_id: attemptId, err: (err as Error).message }, 'eval attempt crashed');
      });
    return { attempt_id: attemptId };
  }

  private purge(): void {
    const t = this.now();
    for (const [id, e] of this.attempts) if (e.expiresAt <= t) this.attempts.delete(id);
    while (this.attempts.size >= MAX_ATTEMPTS) {
      const oldest = this.attempts.keys().next().value;
      if (oldest === undefined) break;
      this.attempts.delete(oldest);
    }
  }
}
