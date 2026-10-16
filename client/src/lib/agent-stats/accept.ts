/* accept.ts — the accept-rate display rules on whole percents (C22). */

export type AcceptLevel = "good" | "warning" | "poor" | "muted";
export type AcceptArrow = { direction: "up" | "down"; points: number } | null;

/** Share × 100 rounded, halves up; null stays null. */
export function wholePercent(rate: number | null): number | null {
  if (rate == null) return null;
  return Math.floor(rate * 100 + 0.5 + 1e-9);
}

/** ≥75 good, 50–74 warning, <50 poor (on the displayed whole percent); grey for a small sample. */
export function acceptLevel(rate: number | null, smallSample: boolean): AcceptLevel {
  const pct = wholePercent(rate);
  if (pct == null || smallSample) return "muted";
  if (pct >= 75) return "good";
  if (pct >= 50) return "warning";
  return "poor";
}

/** Arrow vs the previous period: ≥ 1 displayed point; none when either side is null or a small sample. */
export function acceptArrow(
  cur: number | null,
  curSmall: boolean,
  prev: number | null,
  prevSmall: boolean,
): AcceptArrow {
  const a = wholePercent(cur);
  const b = wholePercent(prev);
  if (a == null || b == null || curSmall || prevSmall) return null;
  const diff = a - b;
  if (Math.abs(diff) < 1) return null;
  return { direction: diff > 0 ? "up" : "down", points: Math.abs(diff) };
}
