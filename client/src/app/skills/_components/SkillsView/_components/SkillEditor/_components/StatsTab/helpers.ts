/** Pure formatting for the Stats tab tiles — null means "not enough data yet",
 *  rendered as "—", never coerced to a misleading 0%. */
export function formatPct(pct: number | null): string {
  return pct == null ? "—" : `${pct}%`;
}

export function maxCategoryCount(byCategory: { count: number }[]): number {
  return byCategory.reduce((max, c) => Math.max(max, c.count), 0) || 1;
}
