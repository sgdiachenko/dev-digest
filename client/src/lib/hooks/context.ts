/* hooks/context.ts — React Query hooks for the Project Context catalog.
     GET  /repos/:id/context              → ContextCatalog (poll while scanning)
     GET  /repos/:id/context/file?path=   → ContextDocContent (404 = not at this commit)
     POST /repos/:id/context/rescan       → 202 ContextRescanAccepted
     GET|PUT /agents/:id/context?repo_id= → AgentContextView (PUT body = full ordered list, all repos)
     GET|PUT /skills/:id/context?repo_id= → SkillContextView */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  AgentContextView,
  ContextAttachmentRef,
  ContextCatalog,
  ContextDocContent,
  ContextRescanAccepted,
  SkillContextView,
} from "../types";

/** Catalog poll interval while a scan is running. */
const SCAN_POLL_MS = 1500;

/** Polls while a scan runs; with `pollNotCloned` also while the repo is still `not_cloned` (after a Resync). */
export function useContextCatalog(
  repoId: string | null | undefined,
  { pollNotCloned = false }: { pollNotCloned?: boolean } = {},
) {
  return useQuery({
    queryKey: ["context-catalog", repoId],
    queryFn: () => api.get<ContextCatalog>(`/repos/${repoId}/context`),
    enabled: !!repoId,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === "scanning" || (pollNotCloned && status === "not_cloned") ? SCAN_POLL_MS : false;
    },
  });
}

/** `sha` (the catalog's scanned_sha) only scopes the cache key — a new scan never serves stale bodies. */
export function useContextDoc(
  repoId: string | null | undefined,
  path: string | null | undefined,
  sha: string | null | undefined,
) {
  return useQuery({
    queryKey: ["context-doc", repoId, sha, path],
    queryFn: () =>
      api.get<ContextDocContent>(
        `/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

export function useRescanContext(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ContextRescanAccepted>(`/repos/${repoId}/context/rescan`),
    onSuccess: () => {
      qc.setQueryData<ContextCatalog>(["context-catalog", repoId], (prev) =>
        prev ? { ...prev, status: "scanning", error: null } : prev,
      );
      qc.invalidateQueries({ queryKey: ["context-catalog", repoId] });
    },
  });
}

/** The agent's attachments as computed for one repo (budget, estimates, inherited skill docs). */
export function useAgentContext(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId, repoId],
    queryFn: () => api.get<AgentContextView>(`/agents/${agentId}/context?repo_id=${repoId}`),
    enabled: !!agentId && !!repoId,
  });
}

/** Replaces the agent's FULL ordered attachment list (all repos); may bump the agent's version. */
export function useSetAgentContext(agentId: string | null | undefined, repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docs: ContextAttachmentRef[]) =>
      api.put<AgentContextView>(`/agents/${agentId}/context?repo_id=${repoId}`, { docs }),
    onSuccess: (data) => {
      qc.setQueryData(["agent-context", agentId, repoId], data);
      qc.invalidateQueries({ queryKey: ["agent-context", agentId] });
      qc.invalidateQueries({ queryKey: ["context-catalog", repoId] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
      qc.invalidateQueries({ queryKey: ["agent-versions", agentId] });
    },
  });
}

export function useSkillContext(skillId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId, repoId],
    queryFn: () => api.get<SkillContextView>(`/skills/${skillId}/context?repo_id=${repoId}`),
    enabled: !!skillId && !!repoId,
  });
}

/** Replaces the skill's FULL ordered attachment list; agents inheriting these docs change too. */
export function useSetSkillContext(skillId: string | null | undefined, repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docs: ContextAttachmentRef[]) =>
      api.put<SkillContextView>(`/skills/${skillId}/context?repo_id=${repoId}`, { docs }),
    onSuccess: (data) => {
      qc.setQueryData(["skill-context", skillId, repoId], data);
      qc.invalidateQueries({ queryKey: ["skill-context", skillId] });
      qc.invalidateQueries({ queryKey: ["agent-context"] });
      qc.invalidateQueries({ queryKey: ["context-catalog", repoId] });
    },
  });
}
