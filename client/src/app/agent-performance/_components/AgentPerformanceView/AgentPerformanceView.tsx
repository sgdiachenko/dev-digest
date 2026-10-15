/* Agent Performance — the period lives in the URL; the response is read-only and never polled. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { resolveHref, Skeleton } from "@devdigest/ui";
import type { AgentPerf } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { NoRunsInPeriod, PeriodControl, StatsErrorPanel, UpdatedStatus } from "@/components/agent-stats";
import { agentStatsKeys, useAgentPerformance } from "@/lib/hooks";
import { resolvePreset, useRefreshFallback, usePeriodUrl, type Period } from "@/lib/agent-stats";
import { useActiveRepo } from "@/lib/repo-context";
import { AgentsTable } from "../AgentsTable";
import { CostBreakdown } from "../CostBreakdown";
import { KpiCards } from "../KpiCards";
import { dashboardState, isInvalidPeriod, type DashboardState } from "./helpers";
import { s } from "./styles";

const EMPTY_PERIOD: Period = { option: "30d", from: "", to: "" };

function Skeletons() {
  return (
    <>
      <div style={s.skeletonGrid}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={120} />
        ))}
      </div>
      <AgentsTable rows={[]} asOf="" period={EMPTY_PERIOD} pending />
    </>
  );
}

function DashboardBody({
  state,
  perf,
  period,
  reason,
  onRetry,
  onShowLast30,
}: {
  state: DashboardState;
  perf: AgentPerf | undefined;
  period: Period;
  reason: string | null;
  onRetry: () => void;
  onShowLast30: () => void;
}) {
  const t = useTranslations("agentPerformance");
  const { repoId } = useActiveRepo();
  if (state === "pending") return <Skeletons />;
  if (state === "invalid") return null;
  if (state === "error" || !perf) {
    return <StatsErrorPanel title={t("dashboard.loadError")} reason={reason} onRetry={onRetry} />;
  }
  if (state === "noAgents") {
    return (
      <div style={s.empty}>
        <span>{t("dashboard.empty.noAgents")}</span>
        <Link href="/agents" style={s.link}>
          {t("dashboard.empty.createAgent")}
        </Link>
      </div>
    );
  }
  if (state === "noReviews") {
    return (
      <div style={s.empty}>
        <span>{t("dashboard.empty.noReviews")}</span>
        <Link href={repoId ? resolveHref("/repos/:repoId/pulls", repoId) : "/"} style={s.link}>
          {t("dashboard.empty.openPulls")}
        </Link>
      </div>
    );
  }
  if (state === "noRuns") {
    return (
      <NoRunsInPeriod lastRunAt={perf.summary.workspace_last_run_at!} option={period.option} onShowLast30={onShowLast30} />
    );
  }
  return (
    <>
      <KpiCards perf={perf} option={period.option} />
      <AgentsTable rows={perf.agents} asOf={perf.as_of} period={period} />
      <CostBreakdown perf={perf} />
    </>
  );
}

export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  const url = usePeriodUrl({ enabled: true });
  const period = url.period!;
  const query = useAgentPerformance(period);
  const fallback = useRefreshFallback<AgentPerf>(url.refreshFrom ? agentStatsKeys.performance(url.refreshFrom) : null);
  const shown = query.data ?? fallback;
  const { select, refresh } = url;
  const { isFetching, refetch } = query;

  const onRefresh = React.useCallback(
    () => refresh({ isFetching, refetchSame: () => void refetch() }),
    [refresh, isFetching, refetch],
  );
  const onRetry = React.useCallback(() => void refetch(), [refetch]);
  const onShowLast30 = () => select(resolvePreset("30d", Date.now()));

  const state = dashboardState({ shown, error: query.error });
  const refreshFailed = !!query.error && !query.data && !!shown && state !== "invalid";
  const reason = query.error instanceof Error ? query.error.message : null;

  return (
    <AppShell crumb={[{ label: t("dashboard.title") }]} onRefresh={onRefresh}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.heading}>{t("dashboard.title")}</h1>
            <p style={s.subtitle}>{t("dashboard.subtitle")}</p>
          </div>
          <PeriodControl period={period} notice={url.notice} serverInvalid={isInvalidPeriod(query.error)} onSelect={select} />
        </div>
        <p style={s.scopeNote}>{t("states.scopeNote")}</p>
        <div style={s.statusRow}>
          <UpdatedStatus asOf={shown?.as_of ?? null} refreshFailed={refreshFailed} onRetry={onRetry} />
        </div>
        <div style={s.body} aria-busy={state === "pending"} data-testid="dashboard-body">
          <DashboardBody
            state={state}
            perf={shown}
            period={period}
            reason={reason}
            onRetry={onRetry}
            onShowLast30={onShowLast30}
          />
        </div>
      </div>
    </AppShell>
  );
}
