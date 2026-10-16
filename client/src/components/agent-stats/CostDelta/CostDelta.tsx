"use client";

import { useTranslations } from "next-intl";
import type { PeriodOption } from "../../../lib/agent-stats/period";
import { useStatsFormat } from "../../../lib/agent-stats/useStatsFormat";
import { s } from "./styles";

/** Change of the average cost against the previous period; green when it fell, red when it rose, text always. */
export function CostDelta({
  current,
  previous,
  option,
}: {
  current: number | null;
  previous: number | null;
  option: PeriodOption;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  if (current == null || previous == null) return null;
  const diff = current - previous;
  const kind = diff < 0 ? "down" : diff > 0 ? "up" : "flat";
  const color = kind === "down" ? "var(--ok)" : kind === "up" ? "var(--crit)" : "var(--text-muted)";
  return (
    <span className="tnum" style={{ ...s.delta, color }}>
      {t(`cost.change.${kind}`, { amount: f.avgUsd(Math.abs(diff)), period: f.periodLabel(option) })}
    </span>
  );
}
