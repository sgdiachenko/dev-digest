/* EstimateSummary — parallel-run totals: slowest agent's time, summed cost. */
"use client";

import { useTranslations } from "next-intl";
import type { EstimateTotals } from "../../helpers";
import { formatCost, formatSeconds } from "../../helpers";

export function EstimateSummary({ totals }: { totals: EstimateTotals }) {
  const t = useTranslations("multiAgent");
  const known = totals.durationMs != null;
  return (
    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
      {known
        ? t("configure.totals", {
            duration: formatSeconds(totals.durationMs),
            cost: formatCost(totals.costUsd),
          })
        : t("configure.noData")}
    </span>
  );
}
