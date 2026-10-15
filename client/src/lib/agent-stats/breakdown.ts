/* breakdown.ts — donut entries: top five + Other, cents that add up, shares (C22/C23). */

export interface ShareEntry {
  key: string;
  label: string;
  value: number;
}

export const OTHER_KEY = "__other__";

/** The five largest entries (ties keep input order) and one `Other` entry with the rest's sum. */
export function topFivePlusOther(entries: ShareEntry[], otherLabel: string): ShareEntry[] {
  if (entries.length <= 5) return entries;
  const sorted = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.value - a.e.value || a.i - b.i)
    .map((x) => x.e);
  const rest = sorted.slice(5).reduce((sum, e) => sum + e.value, 0);
  return [...sorted.slice(0, 5), { key: OTHER_KEY, label: otherLabel, value: rest }];
}

/** Whole cents per amount, adjusted by largest remainder so they sum to `round(total × 100)`. */
export function largestRemainderCents(amounts: number[], total: number): number[] {
  const target = Math.round(total * 100);
  const raw = amounts.map((a) => a * 100);
  const floors = raw.map((r) => Math.floor(r));
  let left = target - floors.reduce((s, n) => s + n, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  const cents = [...floors];
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) cents[order[k]!.i]! += 1;
  for (let k = order.length - 1; left < 0 && order.length > 0; k = (k - 1 + order.length) % order.length, left++) {
    cents[order[k]!.i]! -= 1;
  }
  return cents;
}

/** Whole-percent shares (share × 100, rounded, halves up) of `total`; zeros when `total` ≤ 0. */
export function sharePercents(values: number[], total: number): number[] {
  if (total <= 0) return values.map(() => 0);
  return values.map((v) => Math.floor((v / total) * 100 + 0.5 + 1e-9));
}
