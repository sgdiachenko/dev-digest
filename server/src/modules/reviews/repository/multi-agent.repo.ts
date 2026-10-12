import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { FindingRow } from '../../../db/rows.js';
import type { ReviewRow } from './review.repo.js';

// ---- multi-agent groups: one `multi_agent_runs` row + N linked `agent_runs` ----

export interface GroupRow {
  id: string;
  prId: string;
  ranAt: Date;
}

/** One member run of a group, joined with the agent's current name (null once deleted). */
export interface GroupMemberRow {
  runId: string;
  agentId: string | null;
  agentName: string | null;
  provider: string | null;
  model: string | null;
  status: string | null;
  error: string | null;
  durationMs: number | null;
  costUsd: number | null;
}

export type CreateGroupResult =
  | { kind: 'created'; groupId: string; runs: { id: string; agentId: string }[] }
  | { kind: 'conflict'; groupId: string }
  | { kind: 'pr_not_found' };

/**
 * Create a group and its member runs as ONE fact. The PR row is locked
 * `FOR UPDATE` first, so two concurrent starts for the same PR serialise: the
 * second one sees the first's `running` members and gets a `conflict` instead
 * of a second group (check-then-insert without the lock would race).
 * The service, not this function, turns `conflict` into the 409.
 */
export async function createGroupWithRuns(
  db: Db,
  values: {
    workspaceId: string;
    prId: string;
    agents: { agentId: string; provider: string | null; model: string | null }[];
  },
): Promise<CreateGroupResult> {
  return db.transaction(async (tx) => {
    const [pr] = await tx
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.id, values.prId), eq(t.pullRequests.workspaceId, values.workspaceId)))
      .for('update');
    if (!pr) return { kind: 'pr_not_found' } as const;

    const [latest] = await tx
      .select({ id: t.multiAgentRuns.id })
      .from(t.multiAgentRuns)
      .where(eq(t.multiAgentRuns.prId, values.prId))
      .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
      .limit(1);
    if (latest) {
      const [active] = await tx
        .select({ id: t.agentRuns.id })
        .from(t.agentRuns)
        .where(and(eq(t.agentRuns.multiAgentRunId, latest.id), eq(t.agentRuns.status, 'running')))
        .limit(1);
      if (active) return { kind: 'conflict', groupId: latest.id } as const;
    }

    const [group] = await tx
      .insert(t.multiAgentRuns)
      .values({ workspaceId: values.workspaceId, prId: values.prId })
      .returning({ id: t.multiAgentRuns.id });
    const runs = await tx
      .insert(t.agentRuns)
      .values(
        values.agents.map((a) => ({
          workspaceId: values.workspaceId,
          agentId: a.agentId,
          prId: values.prId,
          provider: a.provider,
          model: a.model,
          status: 'running',
          source: 'local' as const,
          multiAgentRunId: group!.id,
        })),
      )
      .returning({ id: t.agentRuns.id, agentId: t.agentRuns.agentId });
    // RETURNING order is not guaranteed: callers pair runs to agents by `agentId`, never by index.
    return {
      kind: 'created',
      groupId: group!.id,
      runs: runs.filter((r): r is { id: string; agentId: string } => r.agentId != null),
    } as const;
  });
}

/** The PR's newest group (`ran_at desc, id desc`), or undefined. Workspace-scoped. */
export async function latestGroupForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<GroupRow | undefined> {
  const [row] = await db
    .select({ id: t.multiAgentRuns.id, prId: t.multiAgentRuns.prId, ranAt: t.multiAgentRuns.ranAt })
    .from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
    .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
    .limit(1);
  return row;
}

/** Member runs of a group, left-joined with the agent so a deleted agent keeps its column. */
export async function groupMembers(db: Db, groupId: string): Promise<GroupMemberRow[]> {
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(eq(t.agentRuns.multiAgentRunId, groupId));
  return rows.map(({ run, agentName }) => ({
    runId: run.id,
    agentId: run.agentId,
    agentName: agentName ?? null,
    provider: run.provider,
    model: run.model,
    status: run.status,
    error: run.error,
    durationMs: run.durationMs,
    costUsd: run.costUsd,
  }));
}

/** `kind = 'review'` reviews produced by the given runs, each with all its findings. */
export async function reviewsForRuns(
  db: Db,
  runIds: string[],
): Promise<{ review: ReviewRow; findings: FindingRow[] }[]> {
  if (runIds.length === 0) return [];
  const reviews = await db
    .select()
    .from(t.reviews)
    .where(and(inArray(t.reviews.runId, runIds), eq(t.reviews.kind, 'review')))
    .orderBy(desc(t.reviews.createdAt));
  if (reviews.length === 0) return [];
  const findings = await db
    .select()
    .from(t.findings)
    .where(
      inArray(
        t.findings.reviewId,
        reviews.map((r) => r.id),
      ),
    );
  return reviews.map((review) => ({
    review,
    findings: findings.filter((f) => f.reviewId === review.id),
  }));
}

/**
 * Per-agent averages over each agent's last 5 `done` runs, in ONE query. A
 * LATERAL subquery (`order by ran_at desc limit 5`) reads only those rows per
 * agent via `agent_runs_ws_agent_ran_idx`, so cost does not grow with total run
 * history. `avg` ignores nulls (`avgCostUsd: null` when no run captured cost);
 * an agent with no done run is still listed (`runs: 0`, null averages).
 */
export async function doneRunEstimates(
  db: Db,
  workspaceId: string,
): Promise<{ agentId: string; runs: number; avgDurationMs: number | null; avgCostUsd: number | null }[]> {
  const rows = await db.execute<{
    agent_id: string;
    runs: number;
    avg_duration_ms: number | null;
    avg_cost_usd: number | null;
  }>(sql`
    select a.id as agent_id,
           count(r.id)::int as runs,
           avg(r.duration_ms)::float8 as avg_duration_ms,
           avg(r.cost_usd)::float8 as avg_cost_usd
    from ${t.agents} a
    left join lateral (
      select ar.id, ar.duration_ms, ar.cost_usd
      from ${t.agentRuns} ar
      where ar.workspace_id = ${workspaceId}
        and ar.agent_id = a.id
        and ar.status = 'done'
      order by ar.ran_at desc
      limit 5
    ) r on true
    where a.workspace_id = ${workspaceId}
    group by a.id
  `);
  return Array.from(rows).map((r) => ({
    agentId: r.agent_id,
    runs: Number(r.runs),
    avgDurationMs: r.avg_duration_ms == null ? null : Number(r.avg_duration_ms),
    avgCostUsd: r.avg_cost_usd == null ? null : Number(r.avg_cost_usd),
  }));
}
