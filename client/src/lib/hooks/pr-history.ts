/* hooks/pr-history.ts — "Prior PRs touching these files" (P3/E5). A separate
   endpoint from `/pulls/:id/blast` (never bundled into it) so the GitHub reads
   only happen once the collapsible section is actually expanded — see
   `opts.enabled`, driven by `PriorPrsSection`'s local open/closed state. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrHistory } from "@devdigest/shared";

export function usePrHistory(prId: string | null | undefined, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["pr-history", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/history`),
    enabled: !!prId && (opts?.enabled ?? true),
  });
}
