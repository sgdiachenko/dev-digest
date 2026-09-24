/* hooks/smart-diff.ts — Smart Diff: the PR's changed files grouped by role
   (core/tests/wiring/docs/boilerplate), each carrying its latest review
   round's kept findings. Pure read — never triggers the model. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "@devdigest/shared";

/** The PR's Smart Diff. Deterministic classifier server-side — no LLM call. */
export function usePrSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
