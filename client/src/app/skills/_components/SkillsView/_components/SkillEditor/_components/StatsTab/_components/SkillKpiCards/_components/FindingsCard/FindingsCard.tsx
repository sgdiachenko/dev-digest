"use client";

import { useTranslations } from "next-intl";
import { useStatsFormat } from "../../../../../../../../../../../../lib/agent-stats/useStatsFormat";
import { SkillKpiCard } from "../SkillKpiCard";
import { s } from "./styles";

/** Findings of the runs that used the skill, with locale thousands separators. */
export function FindingsCard({ periodLabel, count }: { periodLabel: string; count: number }) {
  const t = useTranslations("skills");
  const f = useStatsFormat();
  return (
    <SkillKpiCard label={t("stats.findings", { period: periodLabel })}>
      <span className="tnum" style={s.value}>
        {f.count(count)}
      </span>
    </SkillKpiCard>
  );
}
