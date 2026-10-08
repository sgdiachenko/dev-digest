/* hooks/tour.ts — React Query hook for the Onboarding Tour.
     GET /repos/:id/tour → Onboarding (facts + optional AI narrative overlay) */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { NarrativeGenerateAccepted, Onboarding } from "../types";

/** Poll interval while an AI narrative is being generated (the polling seam). */
const NARRATIVE_POLL_MS = 1500;

/** The tour for a repo. Polls only while its narrative is `generating`; otherwise one fetch per mount/invalidation. */
export function useRepoTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["repo-tour", repoId],
    queryFn: () => api.get<Onboarding>(`/repos/${repoId}/tour`),
    enabled: !!repoId,
    refetchInterval: (q) => (q.state.data?.narrative?.status === "generating" ? NARRATIVE_POLL_MS : false),
  });
}

/** Starts (or joins) AI narrative generation; the refetch it triggers flips `narrative.status` and starts the polling. */
export function useGenerateNarrative(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<NarrativeGenerateAccepted>(`/repos/${repoId}/tour/narrative`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repo-tour", repoId] });
    },
  });
}
