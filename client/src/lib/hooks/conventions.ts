/* hooks/conventions.ts — React Query hooks for the Conventions Extractor.
   A candidate is a PROPOSED house-rule with verified evidence: the user
   accepts/rejects/edits each one, and the accepted set becomes a skill.
   Extraction runs on the job queue — POST .../extract returns a scan id
   immediately; useConventionScan polls it until it leaves 'running'. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionScan,
  ConventionSkillDraft,
  ConventionStatus,
} from "@devdigest/shared";

export const conventionKeys = {
  list: (repoId: string | null | undefined) => ["conventions", repoId] as const,
  scan: (repoId: string | null | undefined) => ["conventions-scan", repoId] as const,
};

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionKeys.list(repoId),
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * The latest scan for this repo — the poll target while one is `running`.
 * Completion is detected by the CALLER watching `status` leave `'running'`
 * (mirrors `useRepoIntelStatus`'s pattern), which is when it should
 * invalidate `conventionKeys.list(repoId)` to pick up the new/changed rows.
 */
export function useConventionScan(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionKeys.scan(repoId),
    queryFn: () => api.get<ConventionScan | null>(`/repos/${repoId}/conventions/scan`),
    enabled: !!repoId,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 2000 : false),
  });
}

/**
 * Kick off a scan. Costs a model call, so it is a mutation — it must never
 * re-run on a window refocus. The 202 body only carries ids; seed the scan
 * cache with a `running` placeholder so the UI flips to "Scanning…"
 * immediately, before the first poll lands.
 */
export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<{ status: "accepted"; scan_id: string; job_id: string | null }>(
        `/repos/${repoId}/conventions/extract`,
        {},
      ),
    onSuccess: (data, repoId) => {
      qc.setQueryData<ConventionScan>(conventionKeys.scan(repoId), (prev) => ({
        id: data.scan_id,
        repo_id: repoId,
        status: "running",
        sampled_files: prev?.sampled_files ?? [],
        proposed: 0,
        from_config: 0,
        dropped_ungrounded: 0,
        dropped_unsupported: 0,
        dropped_duplicate: 0,
        dropped_existing_skill: 0,
        dropped_category_cap: 0,
        model: null,
        cost_usd: null,
        error: null,
        started_at: new Date().toISOString(),
        finished_at: null,
      }));
    },
  });
}

export interface UpdateConventionInput {
  repoId: string;
  id: string;
  patch: { rule?: string; rationale?: string | null; status?: ConventionStatus };
}

export function useUpdateConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) => api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated, { repoId }) => {
      qc.setQueryData<ConventionCandidate[]>(conventionKeys.list(repoId), (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      );
    },
  });
}

export function useDeleteConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { repoId: string; id: string }) => api.del<{ ok: boolean }>(`/conventions/${id}`),
    onSuccess: (_d, { repoId, id }) => {
      qc.setQueryData<ConventionCandidate[]>(conventionKeys.list(repoId), (prev) => prev?.filter((c) => c.id !== id));
    },
  });
}

/** "Deselect all" — every accepted candidate goes back to pending in one call,
 *  so the board can be re-triaged into a different subset. */
export function useDeselectAllConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/deselect-all`, {}),
    onSuccess: (rows, repoId) => {
      const byId = new Map(rows.map((r) => [r.id, r]));
      qc.setQueryData<ConventionCandidate[]>(conventionKeys.list(repoId), (prev) =>
        prev?.map((c) => byId.get(c.id) ?? c),
      );
    },
  });
}

/**
 * Assemble the accepted candidates into a skill draft. Writes nothing — the
 * modal edits the draft and `useCreateSkill` persists it, the same
 * preview-then-confirm flow skill import uses.
 */
export function useConventionSkillDraft() {
  return useMutation({
    mutationFn: ({ repoId, conventionIds }: { repoId: string; conventionIds?: string[] }) =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill`, {
        ...(conventionIds ? { convention_ids: conventionIds } : {}),
      }),
  });
}
