/* period.ts — the stats period: presets, custom ranges, URL params (C15, C22).
   Pure: nothing here reads the clock; callers pass `now`. */

export type PeriodOption = "1d" | "30d" | "custom";

/** A resolved period: `from` ≤ `ran_at` < `to`, both `toISOString()` text. */
export interface Period {
  option: PeriodOption;
  from: string;
  to: string;
}

export type RangeReason = "incomplete" | "startAfterEnd" | "endInFuture" | "tooLong";
export type RangeValidation = { ok: true } | { ok: false; reason: RangeReason };

export type TrendUnit = "hour" | "day" | "week";

const DAY_MS = 86_400_000;
export const PERIOD_OPTIONS: readonly PeriodOption[] = ["1d", "30d", "custom"];
export const DEFAULT_OPTION: PeriodOption = "30d";
export const PRESET_MS = { "1d": DAY_MS, "30d": 30 * DAY_MS } as const;
/** Longest accepted calendar span of a custom range, both ends included. */
export const MAX_CUSTOM_DAYS = 366;
/** Longest accepted period in ms — the server's `MAX_PERIOD_MS` (367 days). */
export const MAX_PERIOD_MS = 367 * DAY_MS;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The sliding presets: `1d` = now − 24 h, `30d` = now − 720 h, both ending at `now`. */
export function resolvePreset(option: "1d" | "30d", now: number | Date): Period {
  const to = typeof now === "number" ? now : now.getTime();
  return { option, from: new Date(to - PRESET_MS[option]).toISOString(), to: new Date(to).toISOString() };
}

function localMidnight(dateOnly: string, plusDays = 0): Date | null {
  const m = DATE_ONLY.exec(dateOnly);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + plusDays);
}

/** `YYYY-MM-DD` inputs → local 00:00 of `start` .. local 00:00 of the day after `end`. */
export function resolveCustomRange(start: string, end: string): Period | null {
  const from = localMidnight(start);
  const to = localMidnight(end, 1);
  if (!from || !to) return null;
  return { option: "custom", from: from.toISOString(), to: to.toISOString() };
}

export function localDateText(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function calendarDaysInclusive(start: string, end: string): number {
  const a = DATE_ONLY.exec(start)!;
  const b = DATE_ONLY.exec(end)!;
  const ms = Date.UTC(+b[1]!, +b[2]! - 1, +b[3]!) - Date.UTC(+a[1]!, +a[2]! - 1, +a[3]!);
  return Math.round(ms / DAY_MS) + 1;
}

/** Why a custom range can't be applied (the first failing rule), or `{ ok: true }`. */
export function validateCustomRange(start: string, end: string, today: Date): RangeValidation {
  if (!DATE_ONLY.test(start) || !DATE_ONLY.test(end)) return { ok: false, reason: "incomplete" };
  if (start > end) return { ok: false, reason: "startAfterEnd" };
  if (end > localDateText(today)) return { ok: false, reason: "endInFuture" };
  if (calendarDaysInclusive(start, end) > MAX_CUSTOM_DAYS) return { ok: false, reason: "tooLong" };
  return { ok: true };
}

interface ParamsLike {
  get(name: string): string | null;
  toString(): string;
}

function isOption(v: string | null): v is PeriodOption {
  return v === "1d" || v === "30d" || v === "custom";
}

function isCanonicalIso(v: string | null): v is string {
  if (!v) return false;
  const t = Date.parse(v);
  return !Number.isNaN(t) && new Date(t).toISOString() === v;
}

/**
 * Reads `range` / `from` / `to`. No such param → the 30-day fallback (`invalid: false`);
 * any of them present but unusable → the fallback with `invalid: true` (the notice).
 */
export function parsePeriodParams(sp: ParamsLike, nowMs: number): { period: Period; invalid: boolean } {
  const fallback = resolvePreset("30d", nowMs);
  const range = sp.get("range");
  const from = sp.get("from");
  const to = sp.get("to");
  if (range === null && from === null && to === null) return { period: fallback, invalid: false };
  if (!isOption(range) || !isCanonicalIso(from) || !isCanonicalIso(to)) return { period: fallback, invalid: true };
  const span = Date.parse(to) - Date.parse(from);
  if (span <= 0 || span > MAX_PERIOD_MS) return { period: fallback, invalid: true };
  return { period: { option: range, from, to }, invalid: false };
}

/** The current query with `range` / `from` / `to` replaced; every other param is kept. */
export function periodSearchParams(sp: ParamsLike, period: Period): URLSearchParams {
  const next = new URLSearchParams(sp.toString());
  next.set("range", period.option);
  next.set("from", period.from);
  next.set("to", period.to);
  return next;
}

/** `from=…&to=…` for the stats endpoints (values are URL-encoded). */
export function periodApiQuery(period: Pick<Period, "from" | "to">): string {
  return new URLSearchParams({ from: period.from, to: period.to }).toString();
}

/** Trend bucket unit by span — mirrors the server `TREND_BUCKETS` (1 h ≤ 2 d, 1 d ≤ 90 d, else 7 d). */
export function trendUnit(spanMs: number): TrendUnit {
  if (spanMs <= 2 * DAY_MS) return "hour";
  if (spanMs <= 90 * DAY_MS) return "day";
  return "week";
}
