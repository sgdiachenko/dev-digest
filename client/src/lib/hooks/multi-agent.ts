/* hooks/multi-agent.ts — React Query hooks for multi-agent review: the PR's
   latest group, per-agent run estimates, and starting a group. */
"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../api";
import { startBlockReason } from "../multi-agent";
import type { AgentRunEstimate, MultiAgentRun, ReviewRunResponse } from "@devdigest/shared";

/** Poll cadence (ms) while any group member is still running. */
export const MULTI_AGENT_POLL_MS = 3500;

/** 3500 while any column is `running`, otherwise `false` (also for no data). */
export function multiAgentPollInterval(data: MultiAgentRun | null | undefined): number | false {
  return data?.columns.some((c) => c.status === "running") ? MULTI_AGENT_POLL_MS : false;
}

/** The PR's latest multi-agent group, or `null` when it has none. When the
 *  group leaves the running state, the PR's reviews are re-read once so the
 *  findings views do not keep the empty list cached while members ran. */
export function useMultiAgentRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["multi-agent", prId],
    queryFn: () => api.get<MultiAgentRun | null>(`/pulls/${prId}/multi-agent`),
    enabled: !!prId,
    refetchInterval: (q) => multiAgentPollInterval(q.state.data),
  });
  const running = query.data?.columns.some((c) => c.status === "running") ?? false;
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running && query.data) {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
    }
    wasRunning.current = running;
  }, [running, query.data, prId, qc]);
  return query;
}

/** Per-agent averages over each agent's last 5 done runs. */
export function useAgentRunEstimates() {
  return useQuery({
    queryKey: ["agent-run-estimates"],
    queryFn: () => api.get<AgentRunEstimate[]>("/runs/estimates"),
  });
}

export interface StartMultiAgentInput {
  prId: string;
  agentIds: string[];
}

export type StartMultiAgentResponse = ReviewRunResponse & { multi_agent_run_id: string | null };

/** Start a parallel group: POST /pulls/:id/review with `{ agent_ids }` only. */
export function useStartMultiAgentReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: StartMultiAgentInput) =>
      api.post<StartMultiAgentResponse>(`/pulls/${prId}/review`, { agent_ids: agentIds }),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["multi-agent", prId] });
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
    },
  });
}

export interface UseStartGroupInput {
  repoId: string;
  prId: string | null;
  prNumber: number | null;
  /** Ids of the checked, enabled agents. */
  checked: string[];
  /** Agent / PR lists still loading. */
  loading: boolean;
}

/** The start flow shared by the PR popover and the configure page: why the
 *  start is blocked, the start mutation, redirect to the results page on
 *  success, and the 409 (active run) state. */
export function useStartGroup({ repoId, prId, prNumber, checked, loading }: UseStartGroupInput) {
  const router = useRouter();
  const group = useMultiAgentRun(prId);
  const mutation = useStartMultiAgentReview();
  const groupRunning = !!group.data?.columns.some((c) => c.status === "running");
  const reason = startBlockReason({
    checked: checked.length,
    prSelected: !!prId && prNumber != null,
    loading,
    runningGroup: groupRunning,
  });
  const resultsHref = prNumber != null ? `/repos/${repoId}/multi-agent/${prNumber}` : null;
  const error = mutation.error;
  return {
    reason,
    blocked: reason !== null || mutation.isPending,
    groupRunning,
    resultsHref,
    isPending: mutation.isPending,
    error,
    conflict: error instanceof ApiError && error.status === 409,
    start: () => {
      if (!prId || !resultsHref) return;
      mutation.mutate({ prId, agentIds: checked }, { onSuccess: () => router.push(resultsHref) });
    },
  };
}
