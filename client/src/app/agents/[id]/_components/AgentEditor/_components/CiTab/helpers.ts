import { SETTINGS_ERROR_CODES } from "./constants";

/** Whether an API error code is fixed in Settings (token missing / lacking scope). */
export function needsSettings(code: string | undefined): boolean {
  return !!code && SETTINGS_ERROR_CODES.includes(code);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "4 minutes ago"-style text for an ISO timestamp; null when there is none. */
export function relativeTime(iso: string | null, now: number = Date.now()): string | null {
  if (!iso) return null;
  const diff = Date.parse(iso) - now;
  if (Number.isNaN(diff)) return null;
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return fmt.format(Math.round(diff / ms), unit);
  }
  return fmt.format(0, "minute");
}
