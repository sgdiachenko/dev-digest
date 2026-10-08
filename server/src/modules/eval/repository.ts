/**
 * Eval data-access (L06). The ONLY layer of the eval module that touches the DB.
 * Implements `EvalStore` (+ the two extra suite-run ports); every method maps a
 * row to a domain type and every query is workspace-scoped (AC-133).
 *
 * Reads findings / reviews / pull requests / agents / run traces / pr_files
 * tables directly (never another module's repository — INSIGHTS:53).
 */
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type {
  EvalCase,
  EvalCaseBase,
  EvalCaseLastResult,
  EvalCaseResult,
  EvalCaseSource,
  EvalDiffSource,
  EvalErrorReason,
  EvalExpectation,
  EvalInputMeta,
  EvalOverview,
  EvalSuiteRun,
  EvalSuiteRunConfig,
  EvalSuiteRunStatus,
  EvalSuiteRunSummary,
  RunTrace,
} from '@devdigest/shared';
import type { Db, DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { AppError } from '../../platform/errors.js';
import { findingRowToDto } from '../reviews/helpers.js';
import type {
  CaseResultRecord,
  DraftSource,
  EvalStore,
  NewEvalCase,
  RunFinish,
} from './types.js';

type CaseRow = typeof t.evalCases.$inferSelect;
type SuiteRow = typeof t.evalSuiteRuns.$inferSelect;
type CaseRunRow = typeof t.evalRuns.$inferSelect;

const ACTIVE = ['queued', 'running'] as const;
const FINISHED_CASE = ['pass', 'fail', 'error', 'timeout'] as const;
const TREND_POINTS = 10;

const EMPTY_META: EvalInputMeta = {
  pr_title: '',
  pr_body: null,
  pr_number: null,
  repo_full_name: null,
};
const EMPTY_CONFIG: EvalSuiteRunConfig = {
  provider: 'openrouter',
  model: '',
  strategy: 'auto',
  system_prompt: '',
  skills: [],
  temperature: null,
};

/** Postgres unique_violation. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

function hasMetrics(status: EvalSuiteRunStatus): boolean {
  return status === 'completed' || status === 'partial';
}

// ---------------------------------------------------------------------------
// Row -> domain mappers
// ---------------------------------------------------------------------------

interface CaseExtras {
  lastResult: EvalCaseLastResult | null;
  source: EvalCaseSource | null;
}

function toCase(row: CaseRow, extras: CaseExtras): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    type: row.type ?? 'must_find',
    input_diff: row.inputDiff ?? '',
    input_meta: (row.inputMeta as EvalInputMeta | null) ?? EMPTY_META,
    expectations: (row.expectations as EvalExpectation[] | null) ?? [],
    source_finding_id: row.sourceFindingId ?? null,
    diff_source: (row.diffSource as EvalDiffSource | null) ?? 'manual',
    notes: row.notes ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    last_result: extras.lastResult,
    source: extras.source,
  };
}

function toCaseResult(r: CaseRunRow): EvalCaseResult | null {
  if (!(FINISHED_CASE as readonly string[]).includes(r.status)) return null;
  const status = r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : 'error';
  const reason =
    (r.errorReason as EvalErrorReason | null) ?? (r.status === 'timeout' ? 'timeout' : null);
  return {
    case_id: r.caseId,
    case_name: r.caseName ?? '',
    status,
    error_reason: status === 'error' ? reason : null,
    actual_findings: Array.isArray(r.actualOutput)
      ? (r.actualOutput as EvalCaseResult['actual_findings'])
      : [],
    dropped_findings: Array.isArray(r.dropped)
      ? (r.dropped as EvalCaseResult['dropped_findings'])
      : [],
    expected_count: r.expectedCount ?? 0,
    actual_count: r.actualCount ?? 0,
    duration_ms: r.durationMs ?? null,
    cost_usd: r.costUsd ?? null,
  };
}

function toSummary(row: SuiteRow, completedOverride?: number): EvalSuiteRunSummary {
  const status = row.status as EvalSuiteRunStatus;
  const config = (row.config as EvalSuiteRunConfig | null) ?? EMPTY_CONFIG;
  const { system_prompt: _omit, ...configNoPrompt } = config;
  void _omit;
  return {
    id: row.id,
    agent_id: row.agentId,
    status,
    agent_version: row.agentVersion ?? 0,
    config: configNoPrompt,
    case_ids: (row.caseIds as string[] | null) ?? [],
    cases_total: row.casesTotal,
    cases_completed: completedOverride ?? row.casesCompleted,
    cases_errored: row.casesErrored,
    cases_passed: hasMetrics(status) ? row.casesPassed : null,
    recall: row.recall ?? null,
    precision: row.precision ?? null,
    citation_accuracy: row.citationAccuracy ?? null,
    cost_usd: row.costUsd ?? null,
    duration_ms: row.durationMs ?? null,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    error_reason: row.errorReason ?? null,
  };
}

export class EvalRepository implements EvalStore {
  constructor(private db: Db) {}

  // ---- cases ---------------------------------------------------------------

  /** `last_result` (newest finished run row per case), keyed by case id. */
  private async lastResults(
    db: DbOrTx,
    caseIds: string[],
  ): Promise<Map<string, EvalCaseLastResult>> {
    const out = new Map<string, EvalCaseLastResult>();
    if (caseIds.length === 0) return out;
    const rows = await db
      .selectDistinctOn([t.evalRuns.caseId], {
        caseId: t.evalRuns.caseId,
        suiteRunId: t.evalRuns.suiteRunId,
        status: t.evalRuns.status,
        expectedCount: t.evalRuns.expectedCount,
        actualCount: t.evalRuns.actualCount,
        ranAt: t.evalRuns.ranAt,
      })
      .from(t.evalRuns)
      .where(and(inArray(t.evalRuns.caseId, caseIds), inArray(t.evalRuns.status, [...FINISHED_CASE])))
      .orderBy(t.evalRuns.caseId, desc(t.evalRuns.ranAt));
    for (const r of rows) {
      out.set(r.caseId, {
        run_id: r.suiteRunId,
        status: r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : 'error',
        expected_count: r.expectedCount ?? 0,
        actual_count: r.actualCount ?? 0,
        ran_at: r.ranAt.toISOString(),
      });
    }
    return out;
  }

  private caseSelect() {
    return this.db
      .select({
        c: t.evalCases,
        findingTitle: t.findings.title,
        prNumber: t.pullRequests.number,
        repoId: t.pullRequests.repoId,
      })
      .from(t.evalCases)
      .leftJoin(t.findings, eq(t.findings.id, t.evalCases.sourceFindingId))
      .leftJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .leftJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId));
  }

  private mapCases(
    rows: Array<{ c: CaseRow; findingTitle: string | null; prNumber: number | null; repoId: string | null }>,
    last: Map<string, EvalCaseLastResult>,
  ): EvalCase[] {
    return rows.map((r) => {
      // Provenance is stable: the triage comes from the case type, so a later
      // re-triage of the finding never rewrites it (AC-135).
      const source: EvalCaseSource | null =
        r.findingTitle !== null && r.prNumber !== null && r.repoId !== null
          ? {
              finding_title: r.findingTitle,
              pr_number: r.prNumber,
              repo_id: r.repoId,
              triage: r.c.type === 'must_not_flag' ? 'dismissed' : 'accepted',
            }
          : null;
      return toCase(r.c, { lastResult: last.get(r.c.id) ?? null, source });
    });
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCase[]> {
    const rows = await this.caseSelect()
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(desc(t.evalCases.createdAt), asc(t.evalCases.name));
    const last = await this.lastResults(
      this.db,
      rows.map((r) => r.c.id),
    );
    return this.mapCases(rows, last);
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCase | null> {
    const rows = await this.caseSelect().where(
      and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)),
    );
    if (rows.length === 0) return null;
    const last = await this.lastResults(this.db, [caseId]);
    return this.mapCases(rows, last)[0] ?? null;
  }

  async countCases(workspaceId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      );
    return row?.n ?? 0;
  }

  async insertCase(workspaceId: string, input: NewEvalCase): Promise<EvalCase> {
    try {
      const [row] = await this.db
        .insert(t.evalCases)
        .values({
          workspaceId,
          ownerKind: input.owner_kind,
          ownerId: input.owner_id,
          agentId: input.owner_kind === 'agent' ? input.owner_id : null,
          name: input.name,
          type: input.type,
          inputDiff: input.input_diff,
          inputMeta: input.input_meta,
          expectations: input.expectations,
          diffSource: input.diff_source,
          sourceFindingId: input.source_finding_id,
          notes: input.notes,
        })
        .returning();
      const created = await this.getCase(workspaceId, row!.id);
      return created!;
    } catch (err) {
      if (isUniqueViolation(err)) throw this.nameTaken(input.name);
      throw err;
    }
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    input: EvalCaseBase,
  ): Promise<EvalCase | null> {
    try {
      const rows = await this.db
        .update(t.evalCases)
        .set({
          name: input.name,
          type: input.type,
          inputDiff: input.input_diff,
          inputMeta: input.input_meta,
          expectations: input.expectations,
          diffSource: input.diff_source,
          notes: input.notes,
          updatedAt: new Date(),
        })
        .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
        .returning({ id: t.evalCases.id });
      if (rows.length === 0) return null;
      return this.getCase(workspaceId, caseId);
    } catch (err) {
      if (isUniqueViolation(err)) throw this.nameTaken(input.name);
      throw err;
    }
  }

  private nameTaken(name: string): AppError {
    return new AppError('name_taken', `An eval case named "${name}" already exists`, 409);
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    // `eval_runs` rows of the case go with it (FK cascade); the suite runs'
    // stored metrics are untouched (AC-65, AC-89).
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async findCaseBySourceFinding(
    workspaceId: string,
    agentId: string,
    findingId: string,
  ): Promise<{ id: string; name: string } | null> {
    const [row] = await this.db
      .select({ id: t.evalCases.id, name: t.evalCases.name })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
          eq(t.evalCases.sourceFindingId, findingId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Current `skills.version` per skill id (the pinned version of a run's skills). */
  async skillVersions(skillIds: string[]): Promise<Map<string, number>> {
    if (skillIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: t.skills.id, version: t.skills.version })
      .from(t.skills)
      .where(inArray(t.skills.id, skillIds));
    return new Map(rows.map((r) => [r.id, r.version]));
  }

  // ---- draft context ---------------------------------------------------------

  async getDraftSource(workspaceId: string, findingId: string): Promise<DraftSource | null> {
    const [row] = await this.db
      .select({
        finding: t.findings,
        review: t.reviews,
        pr: t.pullRequests,
        repoFullName: t.repos.fullName,
        agentId: t.agents.id,
        agentName: t.agents.name,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .leftJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .leftJoin(
        t.agents,
        and(eq(t.agents.id, t.reviews.agentId), eq(t.agents.workspaceId, workspaceId)),
      )
      .where(and(eq(t.findings.id, findingId), eq(t.reviews.workspaceId, workspaceId)))
      .limit(1);
    if (!row) return null;
    return {
      finding: findingRowToDto(row.finding),
      review: {
        id: row.review.id,
        agent_id: row.review.agentId,
        run_id: row.review.runId,
        pr_id: row.review.prId,
      },
      pr: {
        title: row.pr.title,
        body: row.pr.body,
        number: row.pr.number,
        repo_id: row.pr.repoId,
        repo_full_name: row.repoFullName,
      },
      agent: row.agentId && row.agentName ? { id: row.agentId, name: row.agentName } : null,
    };
  }

  async getRunTrace(
    workspaceId: string,
    runId: string,
  ): Promise<Pick<RunTrace, 'prompt_assembly'> | null> {
    const [row] = await this.db
      .select({ trace: t.runTraces.trace })
      .from(t.runTraces)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runTraces.runId))
      .where(and(eq(t.runTraces.runId, runId), eq(t.agentRuns.workspaceId, workspaceId)))
      .limit(1);
    const trace = row?.trace as Partial<RunTrace> | null | undefined;
    return trace?.prompt_assembly ? { prompt_assembly: trace.prompt_assembly } : null;
  }

  async getPrPatches(
    workspaceId: string,
    prId: string,
  ): Promise<Array<{ path: string; patch: string | null }>> {
    return this.db
      .select({ path: t.prFiles.path, patch: t.prFiles.patch })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(and(eq(t.prFiles.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)))
      .orderBy(asc(t.prFiles.path));
  }

  // ---- suite runs --------------------------------------------------------------

  async createRunWithCases(
    workspaceId: string,
    run: { agent_id: string; agent_version: number; config: EvalSuiteRunConfig; case_ids: string[] },
  ): Promise<{ run_id: string }> {
    try {
      // ONE fact = ONE transaction: the run together with a `queued` row per case.
      return await this.db.transaction(async (tx) => {
        const [suite] = await tx
          .insert(t.evalSuiteRuns)
          .values({
            workspaceId,
            agentId: run.agent_id,
            status: 'queued',
            agentVersion: run.agent_version,
            config: run.config,
            caseIds: run.case_ids,
            casesTotal: run.case_ids.length,
          })
          .returning({ id: t.evalSuiteRuns.id });
        const cases = await tx
          .select({ id: t.evalCases.id, name: t.evalCases.name })
          .from(t.evalCases)
          .where(
            and(eq(t.evalCases.workspaceId, workspaceId), inArray(t.evalCases.id, run.case_ids)),
          );
        if (cases.length > 0) {
          await tx.insert(t.evalRuns).values(
            cases.map((c) => ({
              caseId: c.id,
              suiteRunId: suite!.id,
              caseName: c.name,
              status: 'queued' as const,
            })),
          );
        }
        return { run_id: suite!.id };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const active = await this.activeRun(workspaceId, run.agent_id);
        throw new AppError(
          'run_active',
          'A run is already active for this agent',
          409,
          { active_run_id: active?.id ?? null },
        );
      }
      throw err;
    }
  }

  async markRunRunning(runId: string): Promise<void> {
    await this.db
      .update(t.evalSuiteRuns)
      .set({ status: 'running' })
      .where(and(eq(t.evalSuiteRuns.id, runId), eq(t.evalSuiteRuns.status, 'queued')));
  }

  async setCaseRunning(runId: string, caseId: string): Promise<void> {
    await this.db
      .update(t.evalRuns)
      .set({ status: 'running' })
      .where(and(eq(t.evalRuns.suiteRunId, runId), eq(t.evalRuns.caseId, caseId)));
  }

  async saveCaseResult(runId: string, record: CaseResultRecord): Promise<boolean> {
    const r = record.result;
    const rows = await this.db
      .update(t.evalRuns)
      .set({
        status: record.status,
        pass: record.status === 'pass',
        errorReason: r.error_reason,
        actualOutput: r.actual_findings,
        dropped: r.dropped_findings,
        expectedCount: r.expected_count,
        actualCount: r.actual_count,
        durationMs: r.duration_ms,
        costUsd: r.cost_usd,
        ranAt: new Date(),
      })
      .where(and(eq(t.evalRuns.suiteRunId, runId), eq(t.evalRuns.caseId, record.case_id)))
      .returning({ id: t.evalRuns.id });
    return rows.length > 0;
  }

  async finishRun(runId: string, finish: RunFinish): Promise<void> {
    // Guarded: a run cancelled / interrupted meanwhile is never overwritten.
    await this.db
      .update(t.evalSuiteRuns)
      .set({
        // 'partial' is a valid value of the contract enum; the column is plain text.
        status: finish.status as SuiteRow['status'],
        casesTotal: finish.cases_total,
        casesCompleted: finish.cases_completed,
        casesErrored: finish.cases_errored,
        casesPassed: finish.cases_passed ?? 0,
        recall: finish.recall,
        precision: finish.precision,
        citationAccuracy: finish.citation_accuracy,
        costUsd: finish.cost_usd,
        durationMs: finish.duration_ms === null ? null : Math.round(finish.duration_ms),
        finishedAt: new Date(finish.finished_at),
        errorReason: finish.error_reason,
      })
      .where(and(eq(t.evalSuiteRuns.id, runId), inArray(t.evalSuiteRuns.status, [...ACTIVE])));
  }

  /** Cancel an active run: status `cancelled`, metrics `null`. `false` if it was not active. */
  async cancelRun(runId: string): Promise<boolean> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({
        status: 'cancelled',
        recall: null,
        precision: null,
        citationAccuracy: null,
        casesPassed: 0,
        finishedAt: new Date(),
      })
      .where(and(eq(t.evalSuiteRuns.id, runId), inArray(t.evalSuiteRuns.status, [...ACTIVE])))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length > 0;
  }

  /** Agents of the workspace that own at least one eval case (for run-all). */
  async agentIdsWithCases(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ id: t.evalCases.ownerId })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')));
    return rows.map((r) => r.id);
  }

  /** Finished case counts of still-active runs (progress while `running`). */
  private async finishedCounts(db: DbOrTx, runIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (runIds.length === 0) return out;
    const rows = await db
      .select({ id: t.evalRuns.suiteRunId, n: sql<number>`count(*)::int` })
      .from(t.evalRuns)
      .where(
        and(inArray(t.evalRuns.suiteRunId, runIds), inArray(t.evalRuns.status, [...FINISHED_CASE])),
      )
      .groupBy(t.evalRuns.suiteRunId);
    for (const r of rows) out.set(r.id, r.n);
    return out;
  }

  private async summaries(rows: SuiteRow[]): Promise<EvalSuiteRunSummary[]> {
    const activeIds = rows
      .filter((r) => (ACTIVE as readonly string[]).includes(r.status))
      .map((r) => r.id);
    const counts = await this.finishedCounts(this.db, activeIds);
    return rows.map((r) => toSummary(r, counts.get(r.id)));
  }

  async getRun(workspaceId: string, runId: string): Promise<EvalSuiteRun | null> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, runId)));
    if (!row) return null;
    const caseRows = await this.db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.suiteRunId, runId));
    const order = new Map(((row.caseIds as string[] | null) ?? []).map((id, i) => [id, i]));
    const perCase = caseRows
      .map(toCaseResult)
      .filter((r): r is EvalCaseResult => r !== null)
      .sort((a, b) => (order.get(a.case_id ?? '') ?? 0) - (order.get(b.case_id ?? '') ?? 0));
    const base = toSummary(
      row,
      (ACTIVE as readonly string[]).includes(row.status) ? perCase.length : undefined,
    );
    return {
      ...base,
      config: (row.config as EvalSuiteRunConfig | null) ?? EMPTY_CONFIG,
      per_case: perCase,
    };
  }

  async listRuns(
    workspaceId: string,
    agentId: string,
    opts: { since?: string; limit: number },
  ): Promise<EvalSuiteRunSummary[]> {
    const conds = [eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.agentId, agentId)];
    if (opts.since) conds.push(gte(t.evalSuiteRuns.startedAt, new Date(opts.since)));
    const rows = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(...conds))
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(opts.limit);
    return this.summaries(rows);
  }

  async activeRun(workspaceId: string, agentId: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: t.evalSuiteRuns.id })
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.agentId, agentId),
          inArray(t.evalSuiteRuns.status, [...ACTIVE]),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async recentRuns(workspaceId: string, limit: number): Promise<EvalOverview['recent_runs']> {
    const rows = await this.db
      .select({ run: t.evalSuiteRuns, agentName: t.agents.name })
      .from(t.evalSuiteRuns)
      .innerJoin(t.agents, eq(t.agents.id, t.evalSuiteRuns.agentId))
      .where(eq(t.evalSuiteRuns.workspaceId, workspaceId))
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(limit);
    const summaries = await this.summaries(rows.map((r) => r.run));
    return summaries.map((s, i) => ({ ...s, agent_name: rows[i]!.agentName }));
  }

  async agentsOverview(workspaceId: string): Promise<EvalOverview['agents']> {
    const agentRows = await this.db
      .select({ id: t.agents.id, name: t.agents.name, model: t.agents.model })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.name));
    if (agentRows.length === 0) return [];

    const latestRows = await this.db
      .selectDistinctOn([t.evalSuiteRuns.agentId])
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.workspaceId, workspaceId))
      .orderBy(t.evalSuiteRuns.agentId, desc(t.evalSuiteRuns.startedAt));
    const latestSummaries = await this.summaries(latestRows);
    const latestByAgent = new Map(latestSummaries.map((s) => [s.agent_id, s]));

    // Last TREND_POINTS scored runs PER agent (a window, so one busy agent
    // cannot starve the others' trends), newest first.
    const trendRows = (await this.db.execute(sql`
      select agent_id as "agentId", recall
      from (
        select agent_id, recall,
               row_number() over (partition by agent_id order by started_at desc) as rn
        from eval_suite_runs
        where workspace_id = ${workspaceId}
          and status in ('completed', 'partial')
          and recall is not null
      ) ranked
      where rn <= ${TREND_POINTS}
      order by "agentId", rn
    `)) as unknown as Array<{ agentId: string; recall: number }>;
    const trend = new Map<string, number[]>();
    for (const r of trendRows) {
      const list = trend.get(r.agentId) ?? [];
      list.push(r.recall);
      trend.set(r.agentId, list);
    }

    return agentRows.map((a) => ({
      agent_id: a.id,
      name: a.name,
      model: a.model,
      latest: latestByAgent.get(a.id) ?? null,
      // chronological (oldest first)
      recall_trend: [...(trend.get(a.id) ?? [])].reverse(),
    }));
  }

  async reapActiveRuns(): Promise<number> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({
        status: 'interrupted',
        recall: null,
        precision: null,
        citationAccuracy: null,
        casesPassed: 0,
        finishedAt: new Date(),
      })
      .where(inArray(t.evalSuiteRuns.status, [...ACTIVE]))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length;
  }
}
