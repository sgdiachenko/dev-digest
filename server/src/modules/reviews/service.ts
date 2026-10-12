import type {
  AgentRunEstimate,
  FindingActionKind,
  MultiAgentRun,
  RunEventKind,
  RunTrace,
} from '@devdigest/shared';
import type { RunBus } from '../../platform/sse.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import { ReviewRepository } from './repository.js';
import { buildMultiAgentRun, type ReviewDto, type ReviewDtoFinding } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import { reviewToDto } from './helpers.js';

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
/**
 * What this module needs from the agents store — declared HERE, by the
 * consumer, rather than importing the agents module's repository class.
 *
 * Two modules must not reach into each other's internals; the container owns
 * the single `AgentsRepository` instance and passes it in, and it satisfies
 * this interface structurally. Reviews stays decoupled from how agents are
 * stored, and a test can pass an object literal with two methods.
 */
export interface AgentsReader {
  listEnabled(workspaceId: string): Promise<AgentRow[]>;
  getById(workspaceId: string, id: string): Promise<AgentRow | undefined>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ReviewService {
  constructor(
    private readonly repo: ReviewRepository,
    private readonly agents: AgentsReader,
    private readonly runBus: RunBus,
    private readonly executor: ReviewRunExecutor,
  ) {}

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean },
  ): Promise<AgentRow[]> {
    if (opts.all) return this.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.runBus.complete(runId);
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[] }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentRow; runId: string }[] = [];
    for (const agent of targets) {
      const runId = await this.repo.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
      });
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [] };
  }

  // ===========================================================================
  // Multi-agent group: N enabled agents of one PR, run in parallel.
  // ===========================================================================

  /**
   * Validate a group request and resolve its agents (distinct ids, request
   * order). Unknown and foreign-workspace ids are indistinguishable ("agent not
   * found", via the workspace-scoped `getById`) and take precedence over
   * "agent is disabled".
   */
  async resolveGroupTargets(
    workspaceId: string,
    body: { agentId?: string; all?: boolean; agent_ids?: string[] },
  ): Promise<AgentRow[]> {
    if (body.agentId !== undefined || body.all !== undefined) {
      throw new ValidationError('agent_ids cannot be combined with agentId or all');
    }
    const ids = [...new Set(body.agent_ids ?? [])];
    if (ids.length < 2) throw new ValidationError('agent_ids must contain at least 2 distinct agents');
    // A non-uuid string can never be an agent: same answer as an unknown id, no DB lookup.
    if (ids.some((id) => !UUID_RE.test(id))) throw new ValidationError('agent not found');
    // ONE workspace-scoped lookup; ids are matched in memory.
    const enabled = await this.agents.listEnabled(workspaceId);
    // NFR-4 bound: a group can never hold more agents than the workspace has enabled.
    if (ids.length > enabled.length) throw new ValidationError('too many agents');
    const byId = new Map(enabled.map((a) => [a.id, a]));
    // Ids outside the enabled set are either disabled or unknown/foreign; the
    // (at most `enabled.length`) leftovers are told apart by the scoped getById.
    const missing = ids.filter((id) => !byId.has(id));
    const extra = await Promise.all(missing.map((id) => this.agents.getById(workspaceId, id)));
    if (extra.some((a) => a == null)) throw new ValidationError('agent not found');
    for (const a of extra) byId.set(a!.id, a!);
    const agents = ids.map((id) => byId.get(id)!);
    if (agents.some((a) => !a.enabled)) throw new ValidationError('agent is disabled');
    return agents;
  }

  /**
   * Start a group: the group row and its member runs are created in one
   * transaction (409 if the PR's latest group still has a running member),
   * then the members run in parallel in the background.
   */
  async runGroupReview(
    workspaceId: string,
    prId: string,
    agents: AgentRow[],
    logger?: Logger,
  ): Promise<{
    runs: { run_id: string; agent_id: string; agent_name: string }[];
    reviews: ReviewDto[];
    multi_agent_run_id: string;
  }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const created = await this.repo.createGroupWithRuns({
      workspaceId,
      prId,
      agents: agents.map((a) => ({ agentId: a.id, provider: a.provider, model: a.model })),
    });
    if (created.kind === 'pr_not_found') throw new NotFoundError('Pull request not found');
    if (created.kind === 'conflict') {
      throw new ConflictError('A multi-agent review is already running for this pull request', {
        multi_agent_run_id: created.groupId,
      });
    }

    const runIdByAgent = new Map(created.runs.map((r) => [r.agentId, r.id]));
    const jobs = agents.map((agent) => {
      const runId = runIdByAgent.get(agent.id);
      if (!runId) throw new AppError('group_run_missing', 'A member run was not created', 500);
      return { agent, runId };
    });
    const groupId = created.groupId;
    void this.executor
      .executeRuns(workspaceId, pull, repo, jobs, logger, { parallel: true, groupId })
      .catch((err) => {
        logger?.error({ prId, err: (err as Error).message }, 'review: background group execution crashed');
      });

    return {
      runs: jobs.map(({ agent, runId }) => ({ run_id: runId, agent_id: agent.id, agent_name: agent.name })),
      reviews: [],
      multi_agent_run_id: groupId,
    };
  }

  /** The PR's latest group with grouped findings and takes, or null when it has none. */
  async multiAgentForPull(workspaceId: string, prId: string): Promise<MultiAgentRun | null> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const group = await this.repo.latestGroupForPull(workspaceId, prId);
    if (!group) return null;
    const members = await this.repo.groupMembers(group.id);
    const reviews = await this.repo.reviewsForRuns(members.map((m) => m.runId));
    return buildMultiAgentRun(group, pull, members, reviews);
  }

  /** Per-agent averages over the last 5 `done` runs, for the picker's estimates. */
  async agentRunEstimates(workspaceId: string): Promise<AgentRunEstimate[]> {
    const rows = await this.repo.doneRunEstimates(workspaceId);
    return rows.map((r) => ({
      agent_id: r.agentId,
      runs: r.runs,
      avg_duration_ms: r.avgDurationMs,
      avg_cost_usd: r.avgCostUsd,
    }));
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    const runIds = [...new Set(rows.map(({ review }) => review.runId).filter((id): id is string => id != null))];
    const costs = await this.repo.costsForRuns(runIds);
    return rows.map(({ review, findings }) =>
      reviewToDto(
        review,
        findings,
        review.agentId ? names.get(review.agentId) : null,
        review.runId ? costs.get(review.runId) : null,
      ),
    );
  }

  async getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return this.repo.getRunTrace(runId);
  }
}
