"use client";

import { useQueryClient } from "@tanstack/react-query";

/** Cached data of the previous period's query, shown while a preset refresh loads the new one. */
export function useRefreshFallback<T>(key: readonly unknown[] | null): T | undefined {
  const qc = useQueryClient();
  return key ? qc.getQueryData<T>(key) : undefined;
}
