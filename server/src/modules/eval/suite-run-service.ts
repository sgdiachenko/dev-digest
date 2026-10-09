/**
 * EvalSuiteRunService (L06): runs an agent's whole eval suite, one case at a
 * time, against a configuration and a case set PINNED at the start (AC-74,
 * AC-75). Nothing here touches reviews / findings / agent_runs (AC-167,
 * AC-168). Logs carry ids and numbers only, never content (NFR-14).
 *
 * The pinned inputs live in this process's memory for the life of the run; a
 * restart marks the run `interrupted` (boot sweep), it is never resumed.
 */
import type { EvalSuiteRun, EvalSuiteRunConfig, EvalSuiteRunSummary } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { pinConfig, runEvalReview } from './attempt-service.js';
import { aggregate, scoreCase } from './helpers.js';
import type {
  CaseOutcome,
  EvalAgentReader,
  EvalLlmResolver,
  EvalLogger,
  EvalSkillsReader,
  EvalStore,
  PinnedCase,
  PinnedConfig,
  RunFinish,
} from './types.js';

/** The two persistence operations the suite run needs beyond `EvalStore`. */
export interface SuiteRunStore extends EvalStore {
  /** Active run -> `cancelled`, metrics `null`; `false` when it was not active. */
  cancelRun(runId: string): Promise<boolean>;
  /** Ids of the workspace's agents that own at least one eval case. */
  agentIdsWithCases(workspaceId: string): Promise<string[]>;
}

function toSummary(run: EvalSuiteRun): EvalSuiteRunSummary {
  const { per_case: _perCase, config, ...rest } = run;
  const { system_prompt: _prompt, ...configNoPrompt } = config;
  void _perCase;
  void _prompt;
  return { ...rest, config: configNoPrompt };
}

export class EvalSuiteRunService {
  /** Runs asked to stop; checked before each next case. */
  private readonly cancelled = new Set<string>();
  /** Background executions in flight (lets tests await them). */
  private readonly inflight = new Set<Promise<void>>();

  constructor(
    private readonly store: SuiteRunStore,
    private readonly agents: EvalAgentReader,
    private readonly skills: EvalSkillsReader,
    private readonly resolveLlm: EvalLlmResolver,
    private readonly logger: EvalLogger,
  ) {}

  /** Resolves when every background run has settled (tests, graceful shutdown). */
  async idle(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  async start(workspaceId: string, agentId: string): Promise<{ run_id: string }> {
    const agent = await this.agents.get(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const saved = await this.store.listCases(workspaceId, agentId);
    if (saved.length === 0) {
      throw new AppError('no_cases', 'This agent has no eval cases to run', 422);
    }

    // Pin the configuration and every case input NOW (oldest case first).
    const config = pinConfig(agent, await this.skills.forAgentWithVersion(agent.id));
    const cases: PinnedCase[] = [...saved]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        input_diff: c.input_diff,
        input_meta: c.input_meta,
        expectations: c.expectations,
      }));
    const suiteConfig: EvalSuiteRunConfig = {
      provider: config.provider,
      model: config.model,
      strategy: config.strategy,
      system_prompt: config.system_prompt,
      skills: config.skills.map((s) => ({ id: s.id, version: s.version })),
      temperature: config.temperature,
    };

    // `run_active` (409, details.active_run_id) is raised by the store.
    const { run_id } = await this.store.createRunWithCases(workspaceId, {
      agent_id: agentId,
      agent_version: config.agent_version,
      config: suiteConfig,
      case_ids: cases.map((c) => c.id as string),
    });

    const job = this.execute(run_id, config, cases)
      .catch((err: unknown) => this.failUnexpected(run_id, err))
      .finally(() => {
        this.inflight.delete(job);
        this.cancelled.delete(run_id);
      });
    this.inflight.add(job);
    return { run_id };
  }

  /** Sequential executor: strictly one case at a time, no automatic retries (NFR-4). */
  private async execute(runId: string, config: PinnedConfig, cases: PinnedCase[]): Promise<void> {
    const startedAt = Date.now();
    await this.store.markRunRunning(runId);
    const outcomes: CaseOutcome[] = [];

    for (const c of cases) {
      if (this.cancelled.has(runId)) break;
      outcomes.push(await this.runOne(runId, config, c));
    }

    if (this.cancelled.has(runId)) {
      this.logger.info({ run_id: runId, agent_id: config.agent_id, status: 'cancelled' }, 'eval run cancelled');
      return;
    }

    const agg = aggregate(outcomes);
    const firstError = outcomes.find((o) => o.status === 'error')?.error_reason ?? null;
    const finish: RunFinish = {
      ...agg,
      finished_at: new Date().toISOString(),
      error_reason: agg.status === 'failed' ? firstError : null,
    };
    await this.store.finishRun(runId, finish);
    this.logger.info(
      {
        run_id: runId,
        agent_id: config.agent_id,
        agent_version: config.agent_version,
        cases: cases.length,
        status: agg.status,
        recall: agg.recall,
        precision: agg.precision,
        citation_accuracy: agg.citation_accuracy,
        duration_ms: Date.now() - startedAt,
        cost_usd: agg.cost_usd,
      },
      'eval run finished',
    );
  }

  private async runOne(runId: string, config: PinnedConfig, c: PinnedCase): Promise<CaseOutcome> {
    const caseId = c.id as string;
    try {
      await this.store.setCaseRunning(runId, caseId);
      const r = await runEvalReview({ resolveLlm: this.resolveLlm }, config, c);
      // A case deleted meanwhile touches 0 rows; its outcome still counts (snapshot).
      const stored = await this.store.saveCaseResult(runId, {
        case_id: caseId,
        status: r.record_status,
        result: r.result,
      });
      this.logger.info(
        {
          run_id: runId,
          case_id: caseId,
          status: r.record_status,
          duration_ms: r.outcome.duration_ms,
          cost_usd: r.outcome.cost_usd,
          stored,
        },
        'eval case finished',
      );
      return r.outcome;
    } catch (err) {
      // Persistence failure on one case: the case is `error`, the loop goes on (AC-162).
      this.logger.error({ run_id: runId, case_id: caseId, err: (err as Error).message }, 'eval case failed');
      return {
        ...scoreCase(c.type, c.expectations, [], [], 'provider_error'),
        type: c.type,
        cost_usd: null,
        duration_ms: null,
      };
    }
  }

  /** The executor itself blew up (store down): leave a terminal `failed` row, not a zombie `running`. */
  private async failUnexpected(runId: string, err: unknown): Promise<void> {
    this.logger.error({ run_id: runId, err: (err as Error).message }, 'eval run crashed');
    try {
      await this.store.finishRun(runId, {
        status: 'failed',
        cases_total: 0,
        cases_completed: 0,
        cases_errored: 0,
        cases_passed: null,
        recall: null,
        precision: null,
        citation_accuracy: null,
        cost_usd: null,
        duration_ms: null,
        finished_at: new Date().toISOString(),
        error_reason: 'internal_error',
      });
    } catch {
      /* the boot sweep will mark it interrupted */
    }
  }

  async cancel(workspaceId: string, runId: string): Promise<EvalSuiteRunSummary> {
    const run = await this.store.getRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Eval run not found');
    if (run.status !== 'queued' && run.status !== 'running') {
      throw new AppError('not_running', 'This run is not active', 409);
    }
    this.cancelled.add(runId);
    if (!(await this.store.cancelRun(runId))) {
      this.cancelled.delete(runId);
      throw new AppError('not_running', 'This run is not active', 409);
    }
    const after = await this.store.getRun(workspaceId, runId);
    return toSummary(after ?? { ...run, status: 'cancelled' });
  }

  /** One run per agent that has cases and no active run (AC-114). */
  async runAll(workspaceId: string): Promise<{ run_ids: string[] }> {
    const run_ids: string[] = [];
    for (const agentId of await this.store.agentIdsWithCases(workspaceId)) {
      if (await this.store.activeRun(workspaceId, agentId)) continue;
      try {
        run_ids.push((await this.start(workspaceId, agentId)).run_id);
      } catch (err) {
        // Lost a race to another start, or the suite emptied meanwhile: skip the agent.
        if (err instanceof AppError && ['run_active', 'no_cases', 'not_found'].includes(err.code)) continue;
        throw err;
      }
    }
    return { run_ids };
  }

  async reapOnBoot(): Promise<number> {
    const reaped = await this.store.reapActiveRuns();
    if (reaped > 0) this.logger.info({ reaped }, 'interrupted eval runs left active by a previous process');
    return reaped;
  }
}
