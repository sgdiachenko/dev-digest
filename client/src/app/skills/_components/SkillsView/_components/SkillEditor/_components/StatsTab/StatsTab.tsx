/* StatsTab — every tile derived from existing tables (agent_skills / findings /
   reviews / agent_runs / run_traces), never a separate analytics table. Null
   fields (not enough data yet) render "—", never a misleading 0%. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BarRow, ErrorState, MetricCard, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "../../../../../../../../lib/hooks/skills";
import { formatPct, maxCategoryCount } from "./helpers";
import { s } from "./styles";

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) {
    return (
      <div style={s.metrics}>
        <Skeleton height={90} />
        <Skeleton height={90} />
        <Skeleton height={90} />
        <Skeleton height={90} />
      </div>
    );
  }
  if (isError || !stats) {
    return <ErrorState body={t("stats.noData")} onRetry={() => refetch()} />;
  }

  const maxCount = maxCategoryCount(stats.by_category);

  return (
    <div style={s.wrap}>
      <div style={s.metrics}>
        <MetricCard label={t("stats.usedBy")} value={stats.agent_count} />
        <MetricCard label={t("stats.pullFrequency")} value={formatPct(stats.pull_pct)} />
        <MetricCard label={t("stats.acceptRate")} value={formatPct(stats.accept_pct)} />
        <MetricCard label={t("stats.findings30d")} value={stats.findings_30d} />
      </div>

      <div style={s.panels}>
        <div style={s.panel}>
          <div style={s.panelTitle}>{t("stats.agentsUsingThisSkill")}</div>
          {stats.agents.length === 0 ? (
            <div style={s.empty}>{t("stats.noAgents")}</div>
          ) : (
            stats.agents.map((a, i) => (
              <Link key={a.id} href={`/agents/${a.id}?tab=skills`} style={i === 0 ? s.agentRowFirst : s.agentRow}>
                {a.name}
              </Link>
            ))
          )}
        </div>

        <div style={s.panel}>
          <div style={s.panelTitle}>{t("stats.findingsByCategory")}</div>
          {stats.by_category.length === 0 ? (
            <div style={s.empty}>{t("stats.noCategories")}</div>
          ) : (
            stats.by_category.map((c) => (
              <BarRow key={c.category} label={c.category} value={c.count} max={maxCount} suffix={String(c.count)} />
            ))
          )}
        </div>
      </div>

      <p style={s.note}>{t("stats.attributionNote")}</p>
    </div>
  );
}
