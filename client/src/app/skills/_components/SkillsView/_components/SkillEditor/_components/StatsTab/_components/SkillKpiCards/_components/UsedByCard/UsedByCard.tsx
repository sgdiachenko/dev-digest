"use client";

import { useTranslations } from "next-intl";
import { SkillKpiCard } from "../SkillKpiCard";
import { s } from "./styles";

/** Linked agents, with a singular or plural unit ("1 agent", "3 agents"). */
export function UsedByCard({ count }: { count: number }) {
  const t = useTranslations("skills");
  return (
    <SkillKpiCard label={t("stats.usedBy")}>
      <span className="tnum" style={s.value}>
        {t("stats.agentsCount", { count })}
      </span>
    </SkillKpiCard>
  );
}
