/** In-memory doubles and builders for the agent-stats module's ports (no DB). */
import type {
  AgentRef,
  AgentStatsLogger,
  AgentStatsRaw,
  AgentStatsStore,
  PerformanceRaw,
  RunDecisions,
  RunFact,
  RunHistoryPageRaw,
  StatsWindow,
} from '../../src/modules/agent-stats/types.js';

export const WS = 'ws-1';

export const FROM = new Date('2026-10-01T00:00:00.000Z');
export const TO = new Date('2026-10-31T00:00:00.000Z');

export function makeAgent(over: Partial<AgentRef> = {}): AgentRef {
  return { id: 'a1', name: 'Security Reviewer', enabled: true, ...over };
}

export function makeRun(over: Partial<RunFact> = {}): RunFact {
  return {
    id: 'run-1',
    agentId: 'a1',
    status: 'done',
    ranAt: new Date('2026-10-10T10:00:00.000Z'),
    model: 'm1',
    costUsd: 0.1,
    durationMs: 6000,
    ...over,
  };
}

export function makeDecisions(runId: string, accepted: number, dismissed = 0, pending = 0): RunDecisions {
  return { runId, accepted, dismissed, pending };
}

export function emptyPerformance(over: Partial<PerformanceRaw> = {}): PerformanceRaw {
  return { agents: [], runs: [], decisions: [], lastFinished: [], ...over };
}

export function makeStatsRaw(over: Partial<AgentStatsRaw> = {}): AgentStatsRaw {
  return {
    agent: makeAgent(),
    runs: [],
    decisions: [],
    lastFinishedAt: null,
    severity: [],
    categories: [],
    skillLists: [],
    skillNames: [],
    ...over,
  };
}

/** A store whose answers are set by the test; records the arguments of each call. */
export class FakeAgentStatsStore implements AgentStatsStore {
  performanceResult: PerformanceRaw = emptyPerformance();
  agentStatsResult: AgentStatsRaw | null = makeStatsRaw();
  runHistoryResult: RunHistoryPageRaw | null = { rows: [], total: 0 };
  calls: { method: string; args: unknown[] }[] = [];

  async performance(workspaceId: string, window: StatsWindow): Promise<PerformanceRaw> {
    this.calls.push({ method: 'performance', args: [workspaceId, window] });
    return this.performanceResult;
  }

  async agentStats(
    workspaceId: string,
    agentId: string,
    window: StatsWindow,
    severityBucketMs: number,
  ): Promise<AgentStatsRaw | null> {
    this.calls.push({ method: 'agentStats', args: [workspaceId, agentId, window, severityBucketMs] });
    return this.agentStatsResult;
  }

  async runHistory(
    workspaceId: string,
    agentId: string,
    period: { from: Date; to: Date },
    page: number,
    pageSize: number,
  ): Promise<RunHistoryPageRaw | null> {
    this.calls.push({ method: 'runHistory', args: [workspaceId, agentId, period, page, pageSize] });
    return this.runHistoryResult;
  }
}

export class RecordingLogger implements AgentStatsLogger {
  lines: { obj: Record<string, unknown>; msg?: string }[] = [];
  info(obj: Record<string, unknown>, msg?: string): void {
    this.lines.push({ obj, msg });
  }
}
