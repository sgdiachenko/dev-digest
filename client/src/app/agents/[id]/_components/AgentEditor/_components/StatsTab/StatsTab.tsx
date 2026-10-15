/* StatsTab — an agent's performance for a period: KPI cards, most-used skills, findings panels and the
   run history. The period lives in the URL (usePeriodUrl); this container only reads it (C15). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import type { AgentStats } from "@devdigest/shared";
import {
  NoRunsInPeriod,
  PeriodControl,
  StatsErrorPanel,
  UpdatedStatus,
} from "../../../../../../../components/agent-stats";
import { resolvePreset, trendUnit } from "../../../../../../../lib/agent-stats/period";
import type { PeriodUrlState } from "../../../../../../../lib/agent-stats/usePeriodUrl";
import { useRefreshFallback } from "../../../../../../../lib/agent-stats/useRefreshFallback";
import { agentStatsKeys, useAgentStats } from "../../../../../../../lib/hooks/agent-stats";
import { FindingsByCategory } from "./_components/FindingsByCategory";
import { FindingsBySeverity } from "./_components/FindingsBySeverity";
import { MostUsedSkills } from "./_components/MostUsedSkills";
import { RunHistory } from "./_components/RunHistory";
import { StatsKpiCards } from "./_components/StatsKpiCards";
import { isApiStatus } from "./helpers";
import { s } from "./styles";

export function StatsTab({
  agentId,
  periodState,
  onAgentNotFound,
  onOpenTrace,
  timeZone,
}: {
  agentId: string;
  periodState: PeriodUrlState;
  onAgentNotFound: () => void;
  /** Opens a run's trace drawer on the agent page. */
  onOpenTrace: (runId: string) => void;
  /** Test hook: pins date text to one zone. */
  timeZone?: string;
}) {
  const t = useTranslations("agentPerformance");
  const { period, option, notice, select, refreshFrom } = periodState;
  const q = useAgentStats(agentId, period);
  // A preset refresh moves the period; the previous period's cached figures bridge the reload (AC-175).
  const fallback = useRefreshFallback<AgentStats>(refreshFrom ? agentStatsKeys.stats(agentId, refreshFrom) : null);
  const stats = q.data ?? fallback;

  const notFound = q.isError && isApiStatus(q.error, 404);
  const invalidPeriod = q.isError && isApiStatus(q.error, 422);
  React.useEffect(() => {
    if (notFound) onAgentNotFound();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per 404, whatever the callback's identity
  }, [notFound]);

  if (notFound) return null;

  const controls = period ? (
    <div style={s.controls}>
      <PeriodControl period={period} notice={notice} serverInvalid={invalidPeriod} onSelect={select} timeZone={timeZone} />
      <UpdatedStatus
        asOf={stats?.as_of ?? null}
        refreshFailed={q.isError && !!stats}
        onRetry={() => q.refetch()}
        timeZone={timeZone}
      />
    </div>
  ) : null;

  let body: React.ReactNode;
  if (invalidPeriod) {
    body = null;
  } else if (!stats && q.isError) {
    body = (
      <StatsErrorPanel
        title={t("stats.loadError")}
        reason={q.error instanceof Error ? q.error.message : null}
        onRetry={() => q.refetch()}
      />
    );
  } else if (!stats) {
    body = (
      <div style={s.skeletons} aria-busy="true">
        <Skeleton height={120} />
        <Skeleton height={120} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </div>
    );
  } else if (stats.last_run_at == null) {
    body = <p style={s.message}>{t("stats.neverRan")}</p>;
  } else if (stats.runs === 0) {
    body = (
      <NoRunsInPeriod
        lastRunAt={stats.last_run_at}
        option={option}
        onShowLast30={() => select(resolvePreset("30d", Date.now()))}
        timeZone={timeZone}
      />
    );
  } else {
    const unit = trendUnit(Date.parse(stats.period.to) - Date.parse(stats.period.from));
    body = (
      <>
        <StatsKpiCards stats={stats} option={option} unit={unit} />
        <div style={s.panels}>
          <MostUsedSkills usage={stats.skills_usage} />
        </div>
        <div style={s.panels}>
          <FindingsBySeverity
            buckets={stats.findings_by_severity}
            periodTo={stats.period.to}
            unit={unit}
            timeZone={timeZone}
          />
          <FindingsByCategory categories={stats.findings_by_category} />
        </div>
        <RunHistory
          key={stats.period.from + stats.period.to}
          agentId={agentId}
          period={stats.period}
          timeZone={timeZone}
          onOpenTrace={onOpenTrace}
        />
      </>
    );
  }

  return (
    <div style={s.wrap}>
      <p style={s.note}>{t("states.scopeNote")}</p>
      {controls}
      {body}
    </div>
  );
}
