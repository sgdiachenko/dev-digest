"use client";

import { useTranslations } from "next-intl";
import { HoverHint } from "../../../../../../../../../../../../components/agent-stats";
import { useStatsFormat } from "../../../../../../../../../../../../lib/agent-stats/useStatsFormat";
import { SkillKpiCard } from "../SkillKpiCard";
import { s } from "./styles";

/** Pull frequency: percent with "m of n runs", or "—" with a reason when no run recorded skill data (never 0%). */
export function PullFrequencyCard({
  periodLabel,
  pct,
  pulled,
  total,
  withoutData,
}: {
  periodLabel: string;
  pct: number | null;
  pulled: number;
  total: number;
  withoutData: number;
}) {
  const t = useTranslations("skills");
  const f = useStatsFormat();
  const label = (
    <HoverHint text={t("stats.pullHint")}>
      {(target) => (
        <span tabIndex={0} style={s.hintTarget} {...target}>
          {t("stats.pullFrequency", { period: periodLabel })}
        </span>
      )}
    </HoverHint>
  );
  return (
    <SkillKpiCard label={label}>
      <span className="tnum" style={s.value}>
        {f.percent(pct == null ? null : pct / 100)}
      </span>
      <span style={s.line}>
        {pct == null ? t("stats.noSkillData") : t("stats.pullRuns", { pulled: f.count(pulled), total: f.count(total) })}
      </span>
      {withoutData > 0 && <span style={s.note}>{t("stats.runsWithoutData", { count: withoutData })}</span>}
    </SkillKpiCard>
  );
}
