/**
 * EvalService (L06): eval-case drafts from triaged findings, case CRUD,
 * overview, run reads and run comparison. Ports in, no drizzle, no container.
 * Suite runs and attempts live in `suite-run-service.ts` / `attempt-service.ts`.
 */
import type {
  EvalCase,
  EvalCaseDraft,
  EvalCaseInput,
  EvalOverview,
  EvalRunComparison,
  EvalSuiteRun,
  EvalSuiteRunSummary,
} from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { AGENT_RUNS_LIMIT, MAX_CASES_PER_AGENT, RECENT_RUNS_LIMIT } from './constants.js';
import {
  caseTypeFor,
  compareRuns,
  cutFragment,
  diffFromTrace,
  draftName,
  expectationFromFinding,
  hasMetrics,
  orderRuns,
} from './helpers.js';
import type { DraftSource, EvalAgentReader, EvalStore } from './types.js';

/** Runs returned when the caller bounds the list with `since`. */
const SINCE_RUNS_LIMIT = 200;

/** `diff --git` header + the stored hunks of each persisted `pr_files` patch. */
function diffFromPatches(patches: Array<{ path: string; patch: string | null }>): string {
  const parts: string[] = [];
  for (const f of patches) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`, `--- a/${f.path}`, `+++ b/${f.path}`, f.patch);
  }
  return parts.join('\n');
}

export class EvalService {
  constructor(
    private readonly store: EvalStore,
    private readonly agents: EvalAgentReader,
  ) {}

  // ---- draft ------------------------------------------------------------------

  async getDraft(workspaceId: string, findingId: string): Promise<EvalCaseDraft> {
    const src = await this.store.getDraftSource(workspaceId, findingId);
    if (!src) throw new NotFoundError('Finding not found');

    const type = caseTypeFor(src.finding);
    if (!type) {
      throw new AppError('finding_untriaged', 'Accept or dismiss the finding first', 422);
    }
    if (!src.agent) {
      throw new AppError('agent_missing', 'The agent that produced this finding no longer exists', 422);
    }

    const cut = await this.cutFor(workspaceId, src);
    if (!cut) {
      throw new AppError('diff_unavailable', 'The diff for this finding is not available', 422);
    }

    const f = src.finding;
    const existing = await this.store.findCaseBySourceFinding(workspaceId, src.agent.id, f.id);
    return {
      name: draftName(type, f.title),
      type,
      input_diff: cut.fragment,
      input_meta: {
        pr_title: src.pr.title,
        pr_body: src.pr.body,
        pr_number: src.pr.number,
        repo_full_name: src.pr.repo_full_name,
      },
      expectations: [expectationFromFinding(f)],
      source_finding_id: f.id,
      diff_source: cut.source,
      notes: null,
      owner_id: src.agent.id,
      owner_name: src.agent.name,
      existing_case: existing,
    };
  }

  /** The finding's hunk(s): from the run trace when it carries the diff, else from `pr_files`. */
  private async cutFor(
    workspaceId: string,
    src: DraftSource,
  ): Promise<{ fragment: string; source: 'run_trace' | 'current_pr_files' } | null> {
    const f = src.finding;
    if (src.review.run_id) {
      const trace = await this.store.getRunTrace(workspaceId, src.review.run_id);
      const raw = diffFromTrace(trace);
      if (raw) {
        const fragment = cutFragment(parseUnifiedDiff(raw), f.file, f.start_line, f.end_line, f.kind);
        if (fragment) return { fragment, source: 'run_trace' };
      }
    }
    const patches = await this.store.getPrPatches(workspaceId, src.review.pr_id);
    const raw = diffFromPatches(patches);
    if (!raw) return null;
    const fragment = cutFragment(parseUnifiedDiff(raw), f.file, f.start_line, f.end_line, f.kind);
    return fragment ? { fragment, source: 'current_pr_files' } : null;
  }

  // ---- cases ------------------------------------------------------------------

  private async requireAgent(workspaceId: string, agentId: string) {
    const agent = await this.agents.get(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCase[]> {
    await this.requireAgent(workspaceId, agentId);
    return this.store.listCases(workspaceId, agentId);
  }

  async createCase(workspaceId: string, agentId: string, input: EvalCaseInput): Promise<EvalCase> {
    await this.requireAgent(workspaceId, agentId);
    if ((await this.store.countCases(workspaceId, agentId)) >= MAX_CASES_PER_AGENT) {
      throw new AppError(
        'case_limit',
        `An agent can have at most ${MAX_CASES_PER_AGENT} eval cases`,
        422,
      );
    }
    // The owner comes from the path, never the body.
    return this.store.insertCase(workspaceId, { ...input, owner_kind: 'agent', owner_id: agentId });
  }

  async updateCase(workspaceId: string, caseId: string, input: EvalCaseInput): Promise<EvalCase> {
    const updated = await this.store.updateCase(workspaceId, caseId, input);
    if (!updated) throw new NotFoundError('Eval case not found');
    return updated;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    if (!(await this.store.deleteCase(workspaceId, caseId))) {
      throw new NotFoundError('Eval case not found');
    }
  }

  // ---- runs / overview ----------------------------------------------------------

  async overview(workspaceId: string): Promise<EvalOverview> {
    const [agents, recent_runs] = await Promise.all([
      this.store.agentsOverview(workspaceId),
      this.store.recentRuns(workspaceId, RECENT_RUNS_LIMIT),
    ]);
    return { agents, recent_runs };
  }

  async listRuns(
    workspaceId: string,
    agentId: string,
    since?: string,
  ): Promise<EvalSuiteRunSummary[]> {
    await this.requireAgent(workspaceId, agentId);
    return this.store.listRuns(workspaceId, agentId, {
      ...(since ? { since } : {}),
      limit: since ? SINCE_RUNS_LIMIT : AGENT_RUNS_LIMIT,
    });
  }

  async getRun(workspaceId: string, runId: string): Promise<EvalSuiteRun> {
    const run = await this.store.getRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Eval run not found');
    return run;
  }

  async compare(workspaceId: string, aId: string, bId: string): Promise<EvalRunComparison> {
    const [ra, rb] = await Promise.all([
      this.store.getRun(workspaceId, aId),
      this.store.getRun(workspaceId, bId),
    ]);
    if (!ra || !rb) throw new NotFoundError('Eval run not found');
    if (ra.agent_id !== rb.agent_id) {
      throw new AppError('different_agents', 'Only runs of the same agent can be compared', 422);
    }
    if (!hasMetrics(ra.status) || !hasMetrics(rb.status)) {
      throw new AppError('no_metrics', 'Both runs must have finished with metrics', 422);
    }
    const [older, newer] = orderRuns(ra, rb);
    return { a: older, b: newer, ...compareRuns(older, newer) };
  }
}
