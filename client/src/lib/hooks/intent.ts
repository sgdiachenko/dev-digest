/* hooks/intent.ts — Intent Layer: read the cached PR intent, trigger a
   (synchronous) re-derivation. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { notify } from "../toast";
import type { PrIntentRecord } from "@devdigest/shared";

/** Cached `pr_intent` for a PR, or `null` if never derived. Never triggers the
    model — a pure read. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentRecord | null>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Derive/re-derive the PR's intent (always calls the model; ignores the
    cache). Synchronous — resolves once the model call completes (≤30s). */
export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent`),
    onSuccess: (record) => {
      qc.setQueryData(["pr-intent", prId], record);
    },
    onError: (err: Error) => {
      notify.error(err.message || "Couldn't derive the PR's intent.");
    },
  });
}
