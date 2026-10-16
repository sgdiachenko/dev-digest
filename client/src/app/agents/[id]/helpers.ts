/**
 * The agent page URL for `agentId` that keeps the period params (tab, range, from, to) — AC-164, EC-46.
 * An open run trace belongs to the agent being left, so `trace` is dropped.
 */
export function agentHref(agentId: string, search: string): string {
  const kept = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  kept.delete("trace");
  const query = kept.toString();
  const base = `/agents/${encodeURIComponent(agentId)}`;
  return query ? `${base}?${query}` : base;
}
