/* hooks/blast.ts — Blast radius: the PR's changed symbols, their known
   callers (file:line), and the endpoints/crons downstream of them. Pure
   read over repo-intel's precomputed call graph — no fresh analysis, no
   LLM call. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadiusResponse } from "@devdigest/shared";

/** The PR's blast radius. `degraded`/`reason` on the response signal a
    best-effort result over an incomplete/missing index, not an error. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast-radius", prId],
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
