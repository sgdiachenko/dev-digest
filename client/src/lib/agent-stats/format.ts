/* format.ts — pure `Intl` formatters (C23, NFR-20). Catalog words ("< $0.01", "{value} s",
   "{value}k") are applied by `useStatsFormat`, never here. */

export const DASH = "—";

export interface LessThanMarker {
  lessThan: string;
}
export type UsdText = string | LessThanMarker;
export type TokensText = { text: string } | { thousands: string };

const MIN_VISIBLE_USD = 0.01;

function usd(locale: string, fractionDigits: number): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Totals and breakdown amounts: dollars and cents with separators; a cost > 0 under one cent → marker. */
export function formatTotalUsd(value: number | null, locale: string): UsdText {
  if (value == null) return DASH;
  if (value > 0 && value < MIN_VISIBLE_USD / 2) return { lessThan: usd(locale, 2).format(MIN_VISIBLE_USD) };
  return usd(locale, 2).format(value);
}

/** Averages and per-run costs: under $1 two significant digits, from $1 cents. */
export function formatAvgUsd(value: number | null, locale: string): string {
  if (value == null) return DASH;
  if (value > 0 && value < 1) {
    const digits = Math.max(2, 1 - Math.floor(Math.log10(value)));
    return usd(locale, digits).format(value);
  }
  return usd(locale, 2).format(value);
}

/** Milliseconds as seconds with one decimal ("6.2"); the unit comes from the catalog. */
export function formatSeconds1(ms: number | null, locale: string): string {
  if (ms == null) return DASH;
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000);
}

/** in + out: under 1000 an integer, otherwise thousands rounded (the "k" comes from the catalog). */
export function formatTokensK(tokensIn: number | null, tokensOut: number | null, locale: string): TokensText {
  if (tokensIn == null && tokensOut == null) return { text: DASH };
  const sum = (tokensIn ?? 0) + (tokensOut ?? 0);
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return sum < 1000 ? { text: nf.format(sum) } : { thousands: nf.format(Math.round(sum / 1000)) };
}

export function formatCount(n: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(n);
}

export function formatDateTime(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(iso));
}

export function formatDate(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone }).format(
    new Date(iso),
  );
}

/** Wall-clock time of day, 24 h ("14:05"). */
export function formatTime(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(
    new Date(iso),
  );
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "4 minutes ago"-style text of `iso` against `nowIso` (the response's `as_of`, never the clock). */
export function formatRelative(iso: string, nowIso: string, locale: string): string {
  const diff = Date.parse(iso) - Date.parse(nowIso);
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) return fmt.format(Math.round(diff / ms), unit);
  }
  return fmt.format(0, "minute");
}
