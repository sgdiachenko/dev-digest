/* hooks/context.ts — React Query hooks for the Project Context catalog.
     GET  /repos/:id/context              → ContextCatalog (poll while scanning)
     GET  /repos/:id/context/file?path=   → ContextDocContent (404 = not at this commit)
     POST /repos/:id/context/rescan       → 202 ContextRescanAccepted */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { ContextCatalog, ContextDocContent, ContextRescanAccepted } from "../types";

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
