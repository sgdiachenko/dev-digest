"use client";

import { useTranslations } from "next-intl";
import type { AgentPerf } from "@devdigest/shared";
import { CostLabel, ShareDonut } from "@/components/agent-stats";
import type { ShareEntry } from "@/lib/agent-stats";
import { s } from "./styles";

/** Cost per agent and per model as two donuts; both are shares of the summary's total cost. */
export function CostBreakdown({ perf }: { perf: AgentPerf }) {
  const t = useTranslations("agentPerformance");
  const total = perf.summary.total_cost_usd ?? 0;
  const empty = t("cost.noneInPeriod");
  const byAgent: ShareEntry[] = perf.cost_by_agent.map((e) => ({
    key: e.agent_id ?? "deleted",
    label: e.agent_name ?? t("charts.deletedAgent"),
    value: e.cost_usd,
  }));
  const byModel: ShareEntry[] = perf.cost_by_model.map((e) => ({
    key: e.model ?? "unknown",
    label: e.model ?? t("charts.unknownModel"),
    value: e.cost_usd,
  }));
  return (
    <section style={s.section} aria-labelledby="cost-breakdown-heading">
      <h2 id="cost-breakdown-heading" style={s.heading}>
        {t("dashboard.breakdown.title")}
        <span style={s.headingNote}>
          <CostLabel />
        </span>
      </h2>
      <div style={s.grid}>
        <div style={s.card}>
          <h3 style={s.cardTitle}>{t("dashboard.breakdown.byAgent")}</h3>
          <ShareDonut entries={byAgent} mode="usd" total={total} emptyText={empty} />
        </div>
        <div style={s.card}>
          <h3 style={s.cardTitle}>{t("dashboard.breakdown.byModel")}</h3>
          <ShareDonut entries={byModel} mode="usd" total={total} emptyText={empty} />
        </div>
      </div>
    </section>
  );
}
