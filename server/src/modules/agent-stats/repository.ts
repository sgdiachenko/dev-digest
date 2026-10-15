/**
 * Agent Performance data-access. The ONLY layer of the agent-stats module that
 * touches the DB. Implements `AgentStatsStore`; every method answers from one
 * repeatable-read, read-only transaction (one consistent snapshot per response),
 * is workspace-scoped on every table it reads, and maps rows to domain types.
 *
 * Costs are never summed in SQL (the service folds them in JS, in a fixed
 * order), and the run trace is never loaded whole — only `config.skills`.
 */
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { COUNTED_STATUSES, REVIEW_RUN_SOURCE, type CountedStatus } from '../_shared/stats-rules.js';
import type {
  AgentRef,
  AgentStatsRaw,
  AgentStatsStore,
  LastFinished,
  PerformanceRaw,
  RunDecisions,
  RunFact,
  RunHistoryPageRaw,
  StatsWindow,
} from './types.js';

const READ_ONLY_SNAPSHOT = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;
const RUN_STATUSES = [...COUNTED_STATUSES, 'running'];

export class AgentStatsRepository implements AgentStatsStore {
  constructor(private readonly db: Db) {}

  async performance(workspaceId: string, window: StatsWindow): Promise<PerformanceRaw> {
    return this.db.transaction(async (tx) => {
      const agents = await this.agents(tx, workspaceId);
      const runs = await this.runs(tx, workspaceId, window, null);
      const decisions = await this.decisions(tx, workspaceId, window, null);
      const lastFinished = await this.lastFinished(tx, workspaceId, null);
      return { agents, runs, decisions, lastFinished };
    }, READ_ONLY_SNAPSHOT);
  }

  async agentStats(
    workspaceId: string,
    agentId: string,
    window: StatsWindow,
    severityBucketMs: number,
  ): Promise<AgentStatsRaw | null> {
    return this.db.transaction(async (tx) => {
      const agent = await this.agent(tx, workspaceId, agentId);
      if (!agent) return null;
      const runs = await this.runs(tx, workspaceId, window, agentId);
      const decisions = await this.decisions(tx, workspaceId, window, agentId);
      const lastFinished = await this.lastFinished(tx, workspaceId, agentId);

      // Findings of the agent's `done` runs in the period, every kind and decision.
      const periodRuns = and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.agentId, agentId),
        eq(t.agentRuns.source, REVIEW_RUN_SOURCE),
        eq(t.agentRuns.status, 'done'),
        gte(t.agentRuns.ranAt, window.from),
        lt(t.agentRuns.ranAt, window.to),
      );
      const bucket = sql<number>`floor(extract(epoch from (${t.agentRuns.ranAt} - ${window.from.toISOString()}::timestamptz))::float8 * 1000 / ${severityBucketMs}::float8)::int`;
      const severity = await tx
        .select({ bucket: bucket.mapWith(Number), severity: t.findings.severity, count: sql<number>`count(*)`.mapWith(Number) })
        .from(t.agentRuns)
        .innerJoin(t.reviews, and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.workspaceId, workspaceId)))
        .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
        .where(periodRuns)
        .groupBy(sql`1`, sql`2`);
      const categories = await tx
        .select({ category: t.findings.category, count: sql<number>`count(*)`.mapWith(Number) })
        .from(t.agentRuns)
        .innerJoin(t.reviews, and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.workspaceId, workspaceId)))
        .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
        .where(periodRuns)
        .groupBy(t.findings.category);

      // Only `config.skills` of each counted run leaves the database; the list is validated in JS.
      const skillLists = (
        await tx
          .select({ runId: t.agentRuns.id, value: sql<unknown>`${t.runTraces.trace}->'config'->'skills'` })
          .from(t.agentRuns)
          .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
          .where(
            and(
              eq(t.agentRuns.workspaceId, workspaceId),
              eq(t.agentRuns.agentId, agentId),
              eq(t.agentRuns.source, REVIEW_RUN_SOURCE),
              inArray(t.agentRuns.status, [...COUNTED_STATUSES]),
              gte(t.agentRuns.ranAt, window.from),
              lt(t.agentRuns.ranAt, window.to),
            ),
          )
          .orderBy(asc(t.agentRuns.id))
      ).map((r) => ({ runId: r.runId, value: r.value }));

      const skillIds = new Set<string>();
      for (const { value } of skillLists) {
        if (Array.isArray(value)) for (const id of value) if (typeof id === 'string') skillIds.add(id);
      }
      // Compared as text so a malformed recorded id can never raise a cast error.
      const skillNames =
        skillIds.size === 0
          ? []
          : await tx
              .select({ id: t.skills.id, name: t.skills.name })
              .from(t.skills)
              .where(
                and(
                  eq(t.skills.workspaceId, workspaceId),
                  sql`${t.skills.id}::text in (${sql.join([...skillIds].map((id) => sql`${id}`), sql`, `)})`,
                ),
              );

      return {
        agent,
        runs,
        decisions,
        lastFinishedAt: lastFinished[0]?.ranAt ?? null,
        severity,
        categories,
        skillLists,
        skillNames,
      };
    }, READ_ONLY_SNAPSHOT);
  }

  async runHistory(
    workspaceId: string,
    agentId: string,
    period: { from: Date; to: Date },
    page: number,
    pageSize: number,
  ): Promise<RunHistoryPageRaw | null> {
    return this.db.transaction(async (tx) => {
      const agent = await this.agent(tx, workspaceId, agentId);
      if (!agent) return null;
      const where = and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.agentId, agentId),
        eq(t.agentRuns.source, REVIEW_RUN_SOURCE),
        inArray(t.agentRuns.status, [...COUNTED_STATUSES]),
        gte(t.agentRuns.ranAt, period.from),
        lt(t.agentRuns.ranAt, period.to),
      );
      const [totalRow] = await tx
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(t.agentRuns)
        .where(where);
      const rows = await tx
        .select({
          runId: t.agentRuns.id,
          ranAt: t.agentRuns.ranAt,
          status: t.agentRuns.status,
          repoId: t.repos.id,
          repoFullName: t.repos.fullName,
          prNumber: t.pullRequests.number,
          tokensIn: t.agentRuns.tokensIn,
          tokensOut: t.agentRuns.tokensOut,
          costUsd: t.agentRuns.costUsd,
          findingsCount: t.agentRuns.findingsCount,
        })
        .from(t.agentRuns)
        .leftJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
        .leftJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
        .where(where)
        .orderBy(desc(t.agentRuns.ranAt), desc(t.agentRuns.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      return {
        rows: rows.map((r) => ({ ...r, status: r.status as CountedStatus })),
        total: totalRow?.total ?? 0,
      };
    }, READ_ONLY_SNAPSHOT);
  }

  // ---- shared reads (all take the open transaction) ------------------------------

  private async agents(tx: DbOrTx, workspaceId: string): Promise<AgentRef[]> {
    return tx
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.id));
  }

  /** One workspace-scoped agent, or null when unknown / owned by another workspace. */
  private async agent(tx: DbOrTx, workspaceId: string, agentId: string): Promise<AgentRef | null> {
    const [row] = await tx
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)))
      .limit(1);
    return row ?? null;
  }

  /** Runs in `[previousFrom, to)` with every status the figures need, ordered by id. */
  private async runs(
    tx: DbOrTx,
    workspaceId: string,
    window: StatsWindow,
    agentId: string | null,
  ): Promise<RunFact[]> {
    const rows = await tx
      .select({
        id: t.agentRuns.id,
        agentId: t.agentRuns.agentId,
        status: t.agentRuns.status,
        ranAt: t.agentRuns.ranAt,
        model: t.agentRuns.model,
        costUsd: t.agentRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.source, REVIEW_RUN_SOURCE),
          inArray(t.agentRuns.status, RUN_STATUSES),
          gte(t.agentRuns.ranAt, window.previousFrom),
          lt(t.agentRuns.ranAt, window.to),
          agentId === null ? undefined : eq(t.agentRuns.agentId, agentId),
        ),
      )
      .orderBy(asc(t.agentRuns.id));
    return rows.map((r) => ({ ...r, status: r.status as RunFact['status'] }));
  }

  /**
   * Decision counts per `done` run in `[previousFrom, to)`. Findings reach a
   * run through `reviews.run_id` (workspace-scoped); a review with no run is
   * never joined. Accepted = accepted_at set; dismissed = only dismissed_at
   * set; pending = neither.
   */
  private async decisions(
    tx: DbOrTx,
    workspaceId: string,
    window: StatsWindow,
    agentId: string | null,
  ): Promise<RunDecisions[]> {
    return tx
      .select({
        runId: t.agentRuns.id,
        accepted: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)`.mapWith(Number),
        dismissed:
          sql<number>`count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is not null)`.mapWith(
            Number,
          ),
        pending:
          sql<number>`count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is null)`.mapWith(
            Number,
          ),
      })
      .from(t.agentRuns)
      .innerJoin(t.reviews, and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.workspaceId, workspaceId)))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.source, REVIEW_RUN_SOURCE),
          eq(t.agentRuns.status, 'done'),
          gte(t.agentRuns.ranAt, window.previousFrom),
          lt(t.agentRuns.ranAt, window.to),
          agentId === null ? undefined : eq(t.agentRuns.agentId, agentId),
        ),
      )
      .groupBy(t.agentRuns.id)
      .orderBy(asc(t.agentRuns.id));
  }

  /** Latest finished local run per agent, at any time (null agent = deleted agents). */
  private async lastFinished(tx: DbOrTx, workspaceId: string, agentId: string | null): Promise<LastFinished[]> {
    const rows = await tx
      .select({ agentId: t.agentRuns.agentId, ranAt: sql<Date>`max(${t.agentRuns.ranAt})`.mapWith(t.agentRuns.ranAt) })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.source, REVIEW_RUN_SOURCE),
          inArray(t.agentRuns.status, [...COUNTED_STATUSES]),
          agentId === null ? undefined : eq(t.agentRuns.agentId, agentId),
        ),
      )
      .groupBy(t.agentRuns.agentId);
    return rows;
  }
}
