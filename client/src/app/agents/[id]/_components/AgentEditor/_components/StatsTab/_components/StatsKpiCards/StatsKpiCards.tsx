"use client";

import { useTranslations } from "next-intl";
import type { AgentStats } from "@devdigest/shared";
import { AcceptKpiCard, CostDelta, CostLabel, KpiCard, RunsKpiCard } from "../../../../../../../../../components/agent-stats";
import type { PeriodOption, TrendUnit } from "../../../../../../../../../lib/agent-stats/period";
import { useStatsFormat } from "../../../../../../../../../lib/agent-stats/useStatsFormat";
import { s } from "./styles";

/** The four cards of the Stats tab: runs, average cost, average duration, accept rate (AC-144 – AC-147). */
export function StatsKpiCards({ stats, option, unit }: { stats: AgentStats; option: PeriodOption; unit: TrendUnit }) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  return (
    <div style={s.grid}>
      <RunsKpiCard
        label={t("stats.kpi.totalRuns", { period: f.periodLabel(option) })}
        runs={stats.runs}
        failed={stats.failed}
        cancelled={stats.cancelled}
        trend={stats.runs_trend}
        unit={unit}
      />
      <KpiCard label={t("stats.kpi.avgCost")}>
        <span className="tnum" style={s.value}>
          {f.avgUsd(stats.avg_cost_usd)}
        </span>
        <CostDelta current={stats.avg_cost_usd} previous={stats.previous_avg_cost_usd} option={option} />
        {stats.unknown_cost_runs > 0 && (
          <span style={s.line}>{t("cost.unknownRuns", { count: stats.unknown_cost_runs })}</span>
        )}
        <span style={s.note}>
          <CostLabel />
        </span>
      </KpiCard>
      <KpiCard label={t("stats.kpi.avgDuration")}>
        <span className="tnum" style={s.value}>
          {f.seconds(stats.avg_duration_ms)}
        </span>
      </KpiCard>
      <AcceptKpiCard
        label={t("stats.kpi.acceptRate")}
        rate={stats.accept_rate}
        smallSample={stats.small_sample}
        accepted={stats.accepted}
        dismissed={stats.dismissed}
        pending={stats.pending}
        previousRate={stats.previous_accept_rate}
        previousSmallSample={stats.previous_small_sample}
      />
    </div>
  );
}
