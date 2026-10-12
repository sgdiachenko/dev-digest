/** "2026-10-09 14:05" (UTC) for an ISO timestamp; null when there is none. */
export function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 16).replace("T", " ");
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function formatCost(usd: number | null): string | null {
  if (usd === null) return null;
  return usd > 0 && usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

export function formatDuration(seconds: number | null): string | null {
  return seconds === null ? null : `${Math.round(seconds)}s`;
}
