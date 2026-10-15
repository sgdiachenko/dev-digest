/**
 * Agent Performance use cases (read-only). Takes ports only — never the
 * container or a drizzle handle — and makes no review run and no outbound call.
 * One structured `info` line per call: ids and numbers, never PR or finding text.
 */
import type { AgentPerf, AgentRunHistoryPage, AgentStats } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { SEVERITY_BUCKETS, RUN_HISTORY_PAGE_SIZE } from './constants.js';
import { bucketSizeMs, buildAgentStats, buildPerformance, buildWindow, toRunHistoryPage } from './helpers.js';
import type { AgentStatsLogger, AgentStatsStore } from './types.js';

export class AgentStatsService {
  constructor(
    private readonly store: AgentStatsStore,
    private readonly log: AgentStatsLogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async performance(workspaceId: string, from: string, to: string): Promise<AgentPerf> {
    const startedAt = this.now();
    const window = buildWindow(new Date(from), new Date(to));
    const raw = await this.store.performance(workspaceId, window);
    const result = buildPerformance(raw, window, startedAt);
    this.logCall('agents.performance', workspaceId, from, to, result.agents.length, startedAt);
    return result;
  }

  async agentStats(workspaceId: string, agentId: string, from: string, to: string): Promise<AgentStats> {
    const startedAt = this.now();
    const window = buildWindow(new Date(from), new Date(to));
    const severityBucketMs = bucketSizeMs(window.to.getTime() - window.from.getTime(), SEVERITY_BUCKETS);
    const raw = await this.store.agentStats(workspaceId, agentId, window, severityBucketMs);
    if (!raw) throw new NotFoundError('Agent not found');
    const result = buildAgentStats(raw, window, startedAt);
    this.logCall('agents.stats', workspaceId, from, to, result.runs, startedAt);
    return result;
  }

  async runHistory(
    workspaceId: string,
    agentId: string,
    from: string,
    to: string,
    page: number,
  ): Promise<AgentRunHistoryPage> {
    const startedAt = this.now();
    const raw = await this.store.runHistory(
      workspaceId,
      agentId,
      { from: new Date(from), to: new Date(to) },
      page,
      RUN_HISTORY_PAGE_SIZE,
    );
    if (!raw) throw new NotFoundError('Agent not found');
    const result = toRunHistoryPage(raw, page);
    this.logCall('agents.stats.runs', workspaceId, from, to, result.items.length, startedAt);
    return result;
  }

  private logCall(
    route: string,
    workspaceId: string,
    from: string,
    to: string,
    rows: number,
    startedAt: Date,
  ): void {
    this.log.info({
      route,
      workspace_id: workspaceId,
      from,
      to,
      rows,
      duration_ms: this.now().getTime() - startedAt.getTime(),
    });
  }
}
