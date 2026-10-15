import { largestRemainderCents, sharePercents, topFivePlusOther, type ShareEntry } from "../../../lib/agent-stats/breakdown";

export interface DonutRow {
  key: string;
  label: string;
  value: number;
  /** Whole cents (usd mode) after the largest-remainder adjustment; null in count mode. */
  cents: number | null;
  sharePct: number;
}

/** Top five + Other, adjusted cents and whole-percent shares for the legend (AC-132, AC-133, AC-134). */
export function buildRows(entries: ShareEntry[], mode: "usd" | "count", total: number, otherLabel: string): DonutRow[] {
  const top = topFivePlusOther(entries, otherLabel);
  const values = top.map((e) => e.value);
  const cents = mode === "usd" ? largestRemainderCents(values, total) : null;
  const shares = sharePercents(values, total);
  return top.map((e, i) => ({ key: e.key, label: e.label, value: e.value, cents: cents ? cents[i]! : null, sharePct: shares[i]! }));
}
