/* hooks/eval.ts — React Query hooks for the Eval pipeline (cases, attempts, suite runs, dashboard). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  EvalAttempt,
  EvalAttemptStartResponse,
  EvalCase,
  EvalCaseDraft,
  EvalCaseInputBody,
  EvalOverview,
  EvalRunComparison,
  EvalRunStartResponse,
  EvalSuiteRun,
  EvalSuiteRunSummary,
} from "@devdigest/shared";

/** Poll intervals while a suite run / an attempt is in flight (NFR-6: UI reflects progress within 2 s). */
const RUN_POLL_MS = 2000;
const ATTEMPT_POLL_MS = 1000;

export const evalKeys = {
  cases: (agentId: string | null | undefined) => ["eval-cases", agentId] as const,
  runs: (agentId: string | null | undefined) => ["eval-runs", agentId] as const,
  overview: () => ["eval-overview"] as const,
};

/** Server-built draft of an eval case from a triaged finding. Fetched only while the dialog is open. */
export function useEvalDraft(findingId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["eval-draft", findingId],
    queryFn: () => api.get<EvalCaseDraft>(`/findings/${findingId}/eval-draft`),
    enabled: !!findingId && enabled,
    retry: false,
    gcTime: 0,
  });
}

export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.cases(agentId),
    queryFn: () => api.get<EvalCase[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useEvalRuns(agentId: string | null | undefined, since?: string) {
  return useQuery({
    queryKey: [...evalKeys.runs(agentId), since ?? null],
    queryFn: () =>
      api.get<EvalSuiteRunSummary[]>(
        `/agents/${agentId}/eval-runs${since ? `?since=${encodeURIComponent(since)}` : ""}`,
      ),
    enabled: !!agentId,
  });
}

/** One suite run; polls every 2 s while it is `queued` or `running`. */
export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-run", runId],
    queryFn: () => api.get<EvalSuiteRun>(`/eval-runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === "queued" || status === "running" ? RUN_POLL_MS : false;
    },
  });
}

export function useEvalOverview() {
  return useQuery({
    queryKey: evalKeys.overview(),
    queryFn: () => api.get<EvalOverview>("/eval/overview"),
  });
}

export function useEvalComparison(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-compare", a, b],
    queryFn: () =>
      api.get<EvalRunComparison>(`/eval-runs/compare?a=${encodeURIComponent(a!)}&b=${encodeURIComponent(b!)}`),
    enabled: !!a && !!b,
    retry: false,
  });
}

/** An unpersisted "Run case" attempt; polls every 1 s while `running`. */
export function useEvalAttempt(attemptId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-attempt", attemptId],
    queryFn: () => api.get<EvalAttempt>(`/eval-attempts/${attemptId}`),
    enabled: !!attemptId,
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === "running" ? ATTEMPT_POLL_MS : false),
  });
}

/** Starts an attempt from an (unsaved) draft body. */
export function useStartEvalAttempt(agentId: string | null | undefined) {
  return useMutation({
    mutationFn: (input: EvalCaseInputBody) =>
      api.post<EvalAttemptStartResponse>(`/agents/${agentId}/eval-attempts`, input),
  });
}

/** Starts an attempt from a saved case. */
export function useStartCaseAttempt() {
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalAttemptStartResponse>(`/eval-cases/${caseId}/attempts`),
  });
}

/** Any case change makes the case list, run history and dashboard stale (AC-136). */
function useInvalidateEval(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) }),
      qc.invalidateQueries({ queryKey: evalKeys.runs(agentId) }),
      qc.invalidateQueries({ queryKey: evalKeys.overview() }),
    ]);
}

export function useCreateEvalCase(agentId: string | null | undefined) {
  const invalidate = useInvalidateEval(agentId);
  return useMutation({
    mutationFn: (input: EvalCaseInputBody) => api.post<EvalCase>(`/agents/${agentId}/eval-cases`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateEvalCase(agentId: string | null | undefined) {
  const invalidate = useInvalidateEval(agentId);
  return useMutation({
    mutationFn: ({ caseId, input }: { caseId: string; input: EvalCaseInputBody }) =>
      api.put<EvalCase>(`/eval-cases/${caseId}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteEvalCase(agentId: string | null | undefined) {
  const invalidate = useInvalidateEval(agentId);
  return useMutation({
    mutationFn: (caseId: string) => api.del<{ ok: true }>(`/eval-cases/${caseId}`),
    onSuccess: invalidate,
  });
}

/** `run_id` of the already-active run when the server answers 409 `run_active` (AC-83), else null. */
export function activeRunIdOf(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== "run_active") return null;
  const id = (error.details as { active_run_id?: unknown } | undefined)?.active_run_id;
  return typeof id === "string" ? id : null;
}

/**
 * Starts a suite run. On 409 `run_active` it resolves with the active run's id
 * (`already_active: true`) instead of failing, so the caller joins that run (AC-83).
 */
export function useStartEvalRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<EvalRunStartResponse & { already_active: boolean }> => {
      try {
        const res = await api.post<EvalRunStartResponse>(`/agents/${agentId}/eval-runs`);
        return { ...res, already_active: false };
      } catch (e) {
        const active = activeRunIdOf(e);
        if (active) return { run_id: active, already_active: true };
        throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: evalKeys.runs(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.overview() });
    },
  });
}

/**
 * Starts a suite run for every agent that has cases and no active run. A 409 (nothing to run)
 * resolves with an empty `run_ids` instead of failing.
 */
export function useStartAllEvalRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ run_ids: string[] }> => {
      try {
        return await api.post<{ run_ids: string[] }>("/eval/run-all");
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) return { run_ids: [] };
        throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: evalKeys.overview() });
      qc.invalidateQueries({ queryKey: ["eval-runs"] });
      qc.invalidateQueries({ queryKey: ["eval-cases"] });
    },
  });
}

export function useCancelEvalRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.post<EvalSuiteRunSummary>(`/eval-runs/${runId}/cancel`),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ["eval-run", run.id] });
      qc.invalidateQueries({ queryKey: evalKeys.runs(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.overview() });
    },
  });
}
