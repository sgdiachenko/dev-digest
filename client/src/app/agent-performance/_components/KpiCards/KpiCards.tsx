"use client";

import { useTranslations } from "next-intl";
import type { AgentPerf } from "@devdigest/shared";
import { AcceptKpiCard, RunsKpiCard } from "@/components/agent-stats";
import { trendUnit, useStatsFormat, type PeriodOption } from "@/lib/agent-stats";
import { MostActiveCard } from "./_components/MostActiveCard";
import { TotalCostCard } from "./_components/TotalCostCard";
import { s } from "./styles";

/** The four dashboard KPI cards; every label carries the period ("… (30 days)"). */
export function KpiCards({ perf, option }: { perf: AgentPerf; option: PeriodOption }) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  const { summary } = perf;
  const period = f.periodLabel(option);
  const unit = trendUnit(Date.parse(perf.period.to) - Date.parse(perf.period.from));
  return (
    <div style={s.grid}>
      <RunsKpiCard
        label={t("dashboard.kpi.totalRuns", { period })}
        runs={summary.runs}
        failed={summary.failed}
        cancelled={summary.cancelled}
        inProgress={summary.in_progress}
        trend={perf.runs_trend}
        unit={unit}
      />
      <TotalCostCard
        label={t("dashboard.kpi.totalCost", { period })}
        total={summary.total_cost_usd}
        previous={summary.previous_total_cost_usd}
        unknownRuns={summary.unknown_cost_runs}
        option={option}
      />
      <AcceptKpiCard
        label={t("dashboard.kpi.avgAccept", { period })}
        rate={summary.avg_accept_rate}
        smallSample={summary.small_sample}
        accepted={summary.accepted}
        dismissed={summary.dismissed}
        pending={summary.pending}
      />
      <MostActiveCard label={t("dashboard.kpi.mostActive", { period })} agent={summary.most_active} />
    </div>
  );
}
