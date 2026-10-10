/* hooks/ci.ts — React Query hooks for Export to CI (installations, export, CI runs, refresh). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CiExport, CiExportInputBody, CiInstallation, CiRefreshResponse, CiRun } from "@devdigest/shared";

export const ciKeys = {
  installations: (agentId: string | null | undefined) => ["ci-installations", agentId] as const,
  runs: () => ["ci-runs"] as const,
};

/** Where the agent is installed, with the computed outdated / pending-update flags and the latest run. */
export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ciKeys.installations(agentId),
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci-installations`),
    enabled: !!agentId,
  });
}

/**
 * `POST /agents/:id/export-ci`. `action: "files"` is a side-effect-free preview and invalidates nothing;
 * `action: "open_pr"` changes the installations (and may change the run list), so both are invalidated.
 */
export function useExportCi(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiExportInputBody) => api.post<CiExport>(`/agents/${agentId}/export-ci`, input),
    onSuccess: (_data, input) => {
      if (input.action !== "open_pr") return;
      qc.invalidateQueries({ queryKey: ciKeys.installations(agentId) });
      qc.invalidateQueries({ queryKey: ciKeys.runs() });
    },
  });
}

/** Stored CI runs, newest first (`limit` ≤ 100 server-side). */
export function useCiRuns(limit?: number) {
  return useQuery({
    queryKey: [...ciKeys.runs(), limit ?? null],
    queryFn: () => api.get<CiRun[]>(`/ci-runs${limit ? `?limit=${limit}` : ""}`),
  });
}

/** One synchronous sync of every installation; reloads the run list and the installations' latest run. */
export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CiRefreshResponse>("/ci-runs/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ciKeys.runs() });
      qc.invalidateQueries({ queryKey: ["ci-installations"] });
    },
  });
}
