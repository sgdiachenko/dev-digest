"use client";

import type { SkillStats } from "@devdigest/shared";
import type { PeriodOption } from "../../../../../../../../../../lib/agent-stats/period";
import { useStatsFormat } from "../../../../../../../../../../lib/agent-stats/useStatsFormat";
import { AcceptRateCard } from "./_components/AcceptRateCard";
import { FindingsCard } from "./_components/FindingsCard";
import { PullFrequencyCard } from "./_components/PullFrequencyCard";
import { UsedByCard } from "./_components/UsedByCard";
import { s } from "./styles";

/** The four KPI cards of the skill Stats tab; the period option is named in the labels. */
export function SkillKpiCards({ stats, option }: { stats: SkillStats; option: PeriodOption }) {
  const periodLabel = useStatsFormat().periodLabel(option);
  return (
    <div style={s.grid}>
      <UsedByCard count={stats.agent_count} />
      <PullFrequencyCard
        periodLabel={periodLabel}
        pct={stats.pull_pct}
        pulled={stats.pull_runs}
        total={stats.pull_runs_total}
        withoutData={stats.runs_without_skill_data}
      />
      <AcceptRateCard
        periodLabel={periodLabel}
        rate={stats.accept_rate}
        smallSample={stats.small_sample}
        accepted={stats.accepted}
        dismissed={stats.dismissed}
        pending={stats.pending}
      />
      <FindingsCard periodLabel={periodLabel} count={stats.findings} />
    </div>
  );
}
