/* hooks/brief.ts — PR Brief: read the stored brief, trigger a (synchronous)
   generation. A failed generation leaves the cached brief untouched; errors are
   surfaced inline by the caller, never as a toast. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrBriefRecord } from "@devdigest/shared";

/** Stored brief for a PR, or `null` if none. Never triggers the model. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: () => api.get<PrBriefRecord | null>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Generate (or regenerate) the brief — always one POST; on success the cached
    brief is replaced in place, on failure the cache is left as it was. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefRecord>(`/pulls/${prId}/brief`),
    onSuccess: (record) => {
      qc.setQueryData(["pr-brief", prId], record);
    },
  });
}

export type BriefErrorKind =
  | "llm_timeout"
  | "llm_error"
  | "invalid_output"
  | "no_diff_data"
  | "input_over_budget"
  | "missing_key"
  | "rate_limited"
  | "other";

export interface BriefError {
  kind: BriefErrorKind;
  /** Only for `missing_key`. */
  provider?: string;
}

const REASONS = new Set<string>(["llm_timeout", "llm_error", "invalid_output", "no_diff_data", "input_over_budget"]);

/** Maps a failed generate request to the inline message the card shows. */
export function briefErrorOf(err: unknown): BriefError {
  if (!(err instanceof ApiError)) return { kind: "other" };
  if (err.status === 429) return { kind: "rate_limited" };
  const d = err.details as { reason?: unknown; provider?: unknown } | null | undefined;
  const reason = typeof d?.reason === "string" ? d.reason : null;
  if (reason === "missing_key") {
    return { kind: "missing_key", provider: typeof d?.provider === "string" ? d.provider : undefined };
  }
  if (reason && REASONS.has(reason)) return { kind: reason as BriefErrorKind };
  return { kind: "other" };
}
