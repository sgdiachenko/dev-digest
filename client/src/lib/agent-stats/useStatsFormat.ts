"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  formatAvgUsd,
  formatCount,
  formatDate,
  formatDateTime,
  formatRelative,
  formatSeconds1,
  formatTime,
  formatTokensK,
  formatTotalUsd,
  DASH,
} from "./format";
import { wholePercent } from "./accept";
import type { PeriodOption } from "./period";

/** The S9 formatters bound to the active locale and the `agentPerformance` catalog. */
export function useStatsFormat() {
  const locale = useLocale();
  const t = useTranslations("agentPerformance");

  const percentFormat = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });

  return {
    locale,
    totalUsd(value: number | null): string {
      const out = formatTotalUsd(value, locale);
      return typeof out === "string" ? out : t("cost.lessThan", { amount: out.lessThan });
    },
    avgUsd: (value: number | null) => formatAvgUsd(value, locale),
    seconds(ms: number | null): string {
      return ms == null ? DASH : t("format.seconds", { value: formatSeconds1(ms, locale) });
    },
    tokens(tokensIn: number | null, tokensOut: number | null): string {
      const out = formatTokensK(tokensIn, tokensOut, locale);
      return "text" in out ? out.text : t("format.tokensK", { value: out.thousands });
    },
    count: (n: number) => formatCount(n, locale),
    percent(rate: number | null): string {
      const pct = wholePercent(rate);
      return pct == null ? t("accept.none") : percentFormat.format(pct / 100);
    },
    dateTime: (iso: string, timeZone?: string) => formatDateTime(iso, locale, timeZone),
    date: (iso: string, timeZone?: string) => formatDate(iso, locale, timeZone),
    time: (iso: string, timeZone?: string) => formatTime(iso, locale, timeZone),
    relative: (iso: string, nowIso: string) => formatRelative(iso, nowIso, locale),
    periodLabel: (option: PeriodOption) => t(`period.inLabel.${option}`),
  };
}
