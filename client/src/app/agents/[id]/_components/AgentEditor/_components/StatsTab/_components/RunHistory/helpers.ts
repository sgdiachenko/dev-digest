import type { AgentRunHistoryItem } from "@devdigest/shared";

/** Rows per page — the server's fixed `page_size` (NFR-6). */
export const PAGE_SIZE = 20;

/** 1-based first and last row number of a page holding `count` rows. */
export function pageRange(page: number, count: number): { start: number; end: number } {
  const start = (page - 1) * PAGE_SIZE + 1;
  return { start, end: start + count - 1 };
}

/** The PR page of a run. Built from ids and numbers only (C17). */
export function prHref(repoId: string, prNumber: number): string {
  return `/repos/${encodeURIComponent(repoId)}/pulls/${prNumber}`;
}

/** Failed and cancelled runs produced no token count worth showing (EC-45). */
export function showsTokens(status: AgentRunHistoryItem["status"]): boolean {
  return status === "done";
}
