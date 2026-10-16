/**
 * Agent Performance — module domain types and ports (ring 2/3). The service
 * takes these ports, never the container or a drizzle handle; `repository.ts`
 * implements `AgentStatsStore`, the container wires it.
 */
import type { CountedStatus } from '../_shared/stats-rules.js';

/** The selected period and the equally long one right before it. */
export interface StatsWindow {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
}

export interface AgentRef {
  id: string;
  name: string;
  enabled: boolean;
}

/** One run of the workspace; `agentId` is null once its agent was deleted. */
export interface RunFact {
  id: string;
  agentId: string | null;
  status: CountedStatus | 'running';
  ranAt: Date;
  model: string | null;
  costUsd: number | null;
  durationMs: number | null;
}

/** Decision counts over the findings of one `done` run, as stored at read time. */
export interface RunDecisions {
  runId: string;
  accepted: number;
  dismissed: number;
  pending: number;
}

/** The latest finished run (any time) of an agent; `agentId` null = deleted agents. */
export interface LastFinished {
  agentId: string | null;
  ranAt: Date;
}

/** Everything `GET /agents/performance` needs; runs and decisions cover `[previousFrom, to)`. */
export interface PerformanceRaw {
  agents: AgentRef[];
  runs: RunFact[];
  decisions: RunDecisions[];
  lastFinished: LastFinished[];
}

export interface SeverityCount {
  /** Bucket index counted from the window's `from`. */
  bucket: number;
  severity: string;
  count: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

/** Raw `trace.config.skills` of one counted run — validated in JS, never in SQL. */
export interface SkillListRaw {
  runId: string;
  value: unknown;
}

/** Everything `GET /agents/:id/stats` needs; runs and decisions are the agent's own. */
export interface AgentStatsRaw {
  agent: AgentRef;
  runs: RunFact[];
  decisions: RunDecisions[];
  lastFinishedAt: Date | null;
  severity: SeverityCount[];
  categories: CategoryCount[];
  skillLists: SkillListRaw[];
  skillNames: { id: string; name: string }[];
}

export interface RunHistoryRow {
  runId: string;
  ranAt: Date;
  status: CountedStatus;
  repoId: string | null;
  repoFullName: string | null;
  prNumber: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  findingsCount: number | null;
}

export interface RunHistoryPageRaw {
  rows: RunHistoryRow[];
  total: number;
}

/** Read-only persistence port; every method answers from one consistent read. */
export interface AgentStatsStore {
  performance(workspaceId: string, window: StatsWindow): Promise<PerformanceRaw>;
  /** `null` when the agent is not in the workspace. */
  agentStats(
    workspaceId: string,
    agentId: string,
    window: StatsWindow,
    severityBucketMs: number,
  ): Promise<AgentStatsRaw | null>;
  /** `null` when the agent is not in the workspace. */
  runHistory(
    workspaceId: string,
    agentId: string,
    period: { from: Date; to: Date },
    page: number,
    pageSize: number,
  ): Promise<RunHistoryPageRaw | null>;
}

/** The logger subset the service uses. Never log PR or finding text. */
export interface AgentStatsLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
}
