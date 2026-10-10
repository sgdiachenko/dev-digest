/* format.ts — compact duration / cost formatters shared by the multi-agent
   screens and the PR page. */

/** Compact duration (e.g. "6s", "1m 5s"); "—" when unknown. */
export function formatSeconds(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const rest = total % 60;
  return rest ? `${Math.floor(total / 60)}m ${rest}s` : `${Math.floor(total / 60)}m`;
}

/** Compact USD cost (e.g. "$0.014"); "—" when unknown. */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  const rounded = Number(usd.toPrecision(2));
  if (rounded >= 1) return `$${rounded.toFixed(2)}`;
  // Fixed-decimal (never exponent notation) with 2 significant digits.
  const decimals = Math.min(20, Math.max(2, 1 - Math.floor(Math.log10(rounded))));
  return `$${rounded.toFixed(decimals)}`;
}

/** `formatCost` without trailing zeros under $1 ("$0.06", not "$0.060") — the
 *  PR list / run history / trace drawer style. */
export function formatCostTrimmed(usd: number | null | undefined): string {
  const out = formatCost(usd);
  if (usd == null || usd === 0 || Number(usd.toPrecision(2)) >= 1) return out;
  return out.replace(/(\.\d*?)0+$/, "$1");
}
