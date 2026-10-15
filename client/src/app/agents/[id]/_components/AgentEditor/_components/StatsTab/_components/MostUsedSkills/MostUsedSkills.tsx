"use client";

import { useTranslations } from "next-intl";
import { BarRow } from "@devdigest/ui";
import type { AgentSkillsUsage } from "@devdigest/shared";
import { useStatsFormat } from "../../../../../../../../../lib/agent-stats/useStatsFormat";
import { topSkills } from "../../helpers";
import { s } from "./styles";

/** Top five skills by share of the runs that recorded a skill list, with the coverage note (AC-148 – AC-151). */
export function MostUsedSkills({ usage }: { usage: AgentSkillsUsage }) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  const top = topSkills(usage.skills, usage.runs_with_skill_data);
  const total = usage.runs_with_skill_data + usage.runs_without_skill_data;
  return (
    <section style={s.panel} aria-label={t("stats.skills.title")}>
      <h2 style={s.title}>{t("stats.skills.title")}</h2>
      {top.length === 0 ? (
        <p style={s.empty}>{t("stats.skills.noData")}</p>
      ) : (
        <>
          {top.map((sk) => (
            <BarRow
              key={sk.skillId}
              label={sk.name ?? t("charts.deletedSkill")}
              value={sk.percent}
              max={100}
              suffix={f.percent(sk.percent / 100)}
            />
          ))}
          <p style={s.note}>
            {t("stats.skills.basedOn", { n: f.count(usage.runs_with_skill_data), m: f.count(total) })}
          </p>
        </>
      )}
    </section>
  );
}
