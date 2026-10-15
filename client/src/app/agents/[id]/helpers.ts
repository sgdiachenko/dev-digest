/** The agent page URL for `agentId` that keeps every current query param (tab, range, from, to) — AC-164, EC-46. */
export function agentHref(agentId: string, search: string): string {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const base = `/agents/${encodeURIComponent(agentId)}`;
  return query ? `${base}?${query}` : base;
}
