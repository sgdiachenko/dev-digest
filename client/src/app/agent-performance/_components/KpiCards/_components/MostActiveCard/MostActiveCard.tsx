"use client";

import { useTranslations } from "next-intl";
import type { MostActiveAgent } from "@devdigest/shared";
import { KpiCard, TruncatedName } from "@/components/agent-stats";
import { useStatsFormat } from "@/lib/agent-stats";
import { s } from "./styles";

/** The agent with the most runs; "No agent ran in this period" when there is none. */
export function MostActiveCard({ label, agent }: { label: string; agent: MostActiveAgent | null }) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  if (!agent) {
    return (
      <KpiCard label={label}>
        <span style={s.name}>—</span>
        <span style={s.line}>{t("dashboard.kpi.noMostActiveBody")}</span>
      </KpiCard>
    );
  }
  return (
    <KpiCard label={label}>
      <span style={s.name}>
        <TruncatedName name={agent.agent_name} />
      </span>
      <span style={s.line}>
        {t("dashboard.kpi.mostActiveLine", { runs: f.count(agent.runs), accept: f.percent(agent.accept_rate) })}
      </span>
    </KpiCard>
  );
}
