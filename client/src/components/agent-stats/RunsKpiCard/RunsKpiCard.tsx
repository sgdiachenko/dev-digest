"use client";

import { useTranslations } from "next-intl";
import type { RunsTrendPoint } from "@devdigest/shared";
import type { TrendUnit } from "../../../lib/agent-stats/period";
import { useStatsFormat } from "../../../lib/agent-stats/useStatsFormat";
import { KpiCard } from "../KpiCard";
import { TrendSparkline } from "../TrendSparkline";
import { s } from "./styles";

/** Runs in the period, the failed / cancelled split, a runs-per-bucket sparkline, optional in-progress line. */
export function RunsKpiCard({
  label,
  runs,
  failed,
  cancelled,
  inProgress = 0,
  trend,
  unit,
}: {
  label: string;
  runs: number;
  failed: number;
  cancelled: number;
  inProgress?: number;
  trend: RunsTrendPoint[];
  unit: TrendUnit;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  return (
    <KpiCard label={label}>
      <span className="tnum" style={s.value}>
        {f.count(runs)}
      </span>
      <span style={s.line}>{t("runs.failedCancelled", { failed: f.count(failed), cancelled: f.count(cancelled) })}</span>
      <TrendSparkline data={trend.map((p) => p.runs)} kind="runs" unit={unit} />
      {inProgress > 0 && <span style={s.progress}>{t("runs.inProgress", { count: f.count(inProgress) })}</span>}
    </KpiCard>
  );
}
