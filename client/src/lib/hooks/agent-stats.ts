/* hooks/agent-stats.ts — read-only React Query hooks for the Agent Performance screens (C4, C14). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { periodApiQuery, type Period } from "../agent-stats/period";
import type { AgentPerf, AgentRunHistoryPage, AgentStats } from "@devdigest/shared";

type PeriodRange = Pick<Period, "from" | "to">;

export const agentStatsKeys = {
  all: ["agent-stats"] as const,
  performance: (p: PeriodRange) => ["agent-stats", "performance", p.from, p.to] as const,
  /** Prefix of every cached response of one agent. */
  forAgent: (id: string) => ["agent-stats", "agent", id] as const,
  stats: (id: string, p: PeriodRange) => ["agent-stats", "agent", id, "stats", p.from, p.to] as const,
  runs: (id: string, p: PeriodRange, page: number) =>
    ["agent-stats", "agent", id, "runs", p.from, p.to, page] as const,
};

/** Retry once for network / 5xx failures, never for a 4xx (an invalid period stays invalid). */
function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function useAgentPerformance(period: PeriodRange | null) {
  return useQuery({
    queryKey: period ? agentStatsKeys.performance(period) : agentStatsKeys.all,
    queryFn: () => api.get<AgentPerf>(`/agents/performance?${periodApiQuery(period!)}`),
    enabled: !!period,
    retry: retryUnlessClientError,
  });
}

export function useAgentStats(agentId: string | null | undefined, period: PeriodRange | null) {
  return useQuery({
    queryKey: agentId && period ? agentStatsKeys.stats(agentId, period) : agentStatsKeys.all,
    queryFn: () => api.get<AgentStats>(`/agents/${encodeURIComponent(agentId!)}/stats?${periodApiQuery(period!)}`),
    enabled: !!agentId && !!period,
    retry: retryUnlessClientError,
  });
}

export function useAgentRunHistory(agentId: string | null | undefined, period: PeriodRange | null, page: number) {
  return useQuery({
    queryKey: agentId && period ? agentStatsKeys.runs(agentId, period, page) : agentStatsKeys.all,
    queryFn: () =>
      api.get<AgentRunHistoryPage>(
        `/agents/${encodeURIComponent(agentId!)}/stats/runs?${periodApiQuery(period!)}&page=${page}`,
      ),
    enabled: !!agentId && !!period,
    retry: retryUnlessClientError,
  });
}
