/* StatsTab — a skill's figures for a period: four KPI cards, the agents using it and its findings by
   category. The period lives in the URL (usePeriodUrl, owned by SkillsView); this container only reads it (C15). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import type { Skill, SkillStats } from "@devdigest/shared";
import { PeriodControl, StatsErrorPanel, UpdatedStatus } from "../../../../../../../../components/agent-stats";
import { resolvePreset } from "../../../../../../../../lib/agent-stats/period";
import type { PeriodUrlState } from "../../../../../../../../lib/agent-stats/usePeriodUrl";
import { useRefreshFallback } from "../../../../../../../../lib/agent-stats/useRefreshFallback";
import { useStatsFormat } from "../../../../../../../../lib/agent-stats/useStatsFormat";
import { skillKeys, useSkillStats } from "../../../../../../../../lib/hooks/skills";
import { AgentsUsingPanel } from "./_components/AgentsUsingPanel";
import { FindingsByCategoryPanel } from "./_components/FindingsByCategoryPanel";
import { SkillKpiCards } from "./_components/SkillKpiCards";
import { SkillUsageEmpty } from "./_components/SkillUsageEmpty";
import { skillTabState } from "./helpers";
import { s } from "./styles";

export function StatsTab({
  skill,
  periodState,
  timeZone,
}: {
  skill: Skill;
  periodState: PeriodUrlState;
  /** Test hook: pins date text to one zone. */
  timeZone?: string;
}) {
  const t = useTranslations("skills");
  const f = useStatsFormat();
  const { period, option, notice, select, refreshFrom } = periodState;
  const q = useSkillStats(skill.id, period);
  // A preset refresh moves the period; the previous period's cached figures bridge the reload.
  const fallback = useRefreshFallback<SkillStats>(refreshFrom ? skillKeys.stats(skill.id, refreshFrom) : null);
  const stats = q.data ?? fallback;
  const state = skillTabState(q, stats);
  const periodLabel = f.periodLabel(option);
  const showLast30 = () => select(resolvePreset("30d", Date.now()));

  let body: React.ReactNode = null;
  if (state === "notFound") {
    body = (
      <p style={s.message}>
        {t("stats.notFound")}
        <Link href="/skills" style={s.link}>
          {t("stats.backToSkills")}
        </Link>
      </p>
    );
  } else if (state === "error") {
    body = (
      <StatsErrorPanel
        title={t("stats.loadError")}
        reason={q.error instanceof Error ? q.error.message : null}
        onRetry={() => q.refetch()}
      />
    );
  } else if (state === "pending") {
    body = (
      <>
        <div style={s.skeletons} aria-busy="true">
          <Skeleton height={110} />
          <Skeleton height={110} />
          <Skeleton height={110} />
          <Skeleton height={110} />
        </div>
        <div style={s.panels} aria-busy="true">
          <Skeleton height={160} />
          <Skeleton height={160} />
        </div>
      </>
    );
  } else if (stats && state !== "invalid") {
    body = (
      <>
        {!skill.enabled && <p style={s.hint}>{t("stats.disabledHint")}</p>}
        {state === "noUsage" ? (
          <SkillUsageEmpty kind="noUsage" lastUsedAt={null} option={option} onShowLast30={showLast30} />
        ) : state === "noRuns" ? (
          <>
            <SkillUsageEmpty
              kind="noRuns"
              lastUsedAt={stats.last_used_at}
              option={option}
              onShowLast30={showLast30}
              timeZone={timeZone}
            />
            <div style={s.panels}>
              <AgentsUsingPanel agents={stats.agents} />
            </div>
            <p style={s.note}>{t("stats.attributionNote")}</p>
          </>
        ) : (
          <>
            <SkillKpiCards stats={stats} option={option} />
            <div style={s.panels}>
              <AgentsUsingPanel agents={stats.agents} />
              <FindingsByCategoryPanel categories={stats.by_category} periodLabel={periodLabel} />
            </div>
            <p style={s.note}>{t("stats.attributionNote")}</p>
          </>
        )}
      </>
    );
  }

  return (
    <div style={s.wrap}>
      {period && (
        <div style={s.controls}>
          <PeriodControl
            period={period}
            notice={notice}
            serverInvalid={state === "invalid"}
            onSelect={select}
            timeZone={timeZone}
          />
          <UpdatedStatus
            asOf={stats?.as_of ?? null}
            refreshFailed={q.isError && !!stats && state !== "invalid" && state !== "notFound"}
            onRetry={() => q.refetch()}
            timeZone={timeZone}
          />
        </div>
      )}
      {body}
    </div>
  );
}
