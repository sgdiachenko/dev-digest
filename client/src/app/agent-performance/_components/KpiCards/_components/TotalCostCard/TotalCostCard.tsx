"use client";

import { useTranslations } from "next-intl";
import { CostDelta, CostLabel, KpiCard } from "@/components/agent-stats";
import { useStatsFormat, type PeriodOption } from "@/lib/agent-stats";
import { s } from "./styles";

/** Total cost with the "recorded by DevDigest" label, the change vs the previous period and the unknown-cost line. */
export function TotalCostCard({
  label,
  total,
  previous,
  unknownRuns,
  option,
}: {
  label: string;
  total: number | null;
  previous: number | null;
  unknownRuns: number;
  option: PeriodOption;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  return (
    <KpiCard label={label}>
      <span className="tnum" style={s.value}>
        {f.totalUsd(total)}
      </span>
      <CostDelta current={total} previous={previous} option={option} />
      <span style={s.muted}>
        <CostLabel />
      </span>
      {unknownRuns > 0 && <span style={s.line}>{t("cost.unknownRuns", { count: unknownRuns })}</span>}
    </KpiCard>
  );
}
