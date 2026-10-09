/* One agent's eval history: KPI tiles, trend, run table, "Run all evals" and the compare modal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { EvalOverview } from "@devdigest/shared";
import { useEvalComparison, useEvalRuns } from "@/lib/hooks/eval";
import { AgentMetricCards } from "../AgentMetricCards";
import { CompareRunsModal } from "../CompareRunsModal";
import { hasMetrics, latestTwo, newestFirst, toggleSelection } from "../helpers";
import { MetricTrendChart } from "../MetricTrendChart";
import { RangeFilter, type RangeValue } from "../RangeFilter";
import { RecentRunsTable } from "../RecentRunsTable";
import { RegressionAlert } from "../RegressionAlert";
import { s } from "../styles";
import type { DashboardUrl } from "../EvalDashboardView/useDashboardUrl";
import { useRunControl } from "./useRunControl";

type OverviewAgent = EvalOverview["agents"][number];

const DAY_MS = 86_400_000;

export function AgentView({ agent, agents, url }: { agent: OverviewAgent; agents: OverviewAgent[]; url: DashboardUrl }) {
  const t = useTranslations("eval");
  const [range, setRange] = React.useState<{ value: RangeValue; since?: string }>({ value: "all" });
  const [selected, setSelected] = React.useState<string[]>([]);

  const { data, isLoading, isError, refetch } = useEvalRuns(agent.agent_id, range.since);
  const runs = React.useMemo(() => newestFirst(data ?? []), [data]);
  const control = useRunControl(agent.agent_id, runs, () => void refetch());

  const [aId, bId] = url.compareIds ?? [null, null];
  const comparison = useEvalComparison(aId, bId);
  const metricRuns = runs.filter(hasMetrics);
  // A compare link is stale when the server refuses it, or when a listed run has no metrics (AC-129).
  const unavailable =
    !!url.compareIds &&
    (comparison.isError ||
      runs.some((r) => (r.id === aId || r.id === bId) && !hasMetrics(r)));

  const pickRange = (value: RangeValue) =>
    setRange(value === "30" ? { value, since: new Date(Date.now() - 30 * DAY_MS).toISOString() } : { value });

  const runButton = (
    <Button
      kind="primary"
      icon="Play"
      loading={control.starting}
      disabled={!!control.activeRunId || control.starting}
      title={control.activeRunId ? t("common.runAllEvalsDisabledActive") : undefined}
      onClick={control.start}
    >
      {t("agentView.runAllEvals")}
    </Button>
  );

  const lastCases = latestTwo(runs)[0]?.cases_total ?? 0;

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div style={{ ...s.stack, marginTop: 18 }} aria-busy="true">
        <Skeleton height={96} />
        <Skeleton height={200} />
        <Skeleton height={120} />
      </div>
    );
  } else if (isError && !data) {
    body = <ErrorState title={t("errors.loadFailed")} body={t("errors.loadFailedBody")} onRetry={() => void refetch()} />;
  } else if (runs.length === 0) {
    body = (
      <div style={{ marginTop: 32 }}>
        <EmptyState
          icon="Gauge"
          title={t("agentView.emptyTitle", { agent: agent.name })}
          cta={t("agentView.runAllEvals")}
          onCta={control.start}
          ctaLoading={control.starting}
        />
      </div>
    );
  } else {
    body = (
      <>
        <div style={{ marginTop: 16 }}>
          <RegressionAlert runs={runs} />
        </div>
        <AgentMetricCards runs={runs} />
        <MetricTrendChart runs={metricRuns} />
        <RecentRunsTable
          runs={runs}
          selected={selected}
          onToggle={(id) => setSelected((cur) => toggleSelection(cur, id))}
          onCompare={() => selected.length === 2 && url.openCompare(selected[0]!, selected[1]!)}
          onCancel={control.cancel}
        />
      </>
    );
  }

  return (
    <div>
      <Button kind="tertiary" size="sm" onClick={url.backToOverview}>
        {t("agentView.back")}
      </Button>
      <div style={{ ...s.header, marginTop: 8 }}>
        <div>
          <div style={s.headingRow}>
            <h1 style={s.heading}>{agent.name}</h1>
            <Badge mono>{agent.model}</Badge>
          </div>
          <p style={s.subtitle}>{t("agentView.subtitle", { runs: runs.length, cases: lastCases })}</p>
        </div>
        <div style={s.actions}>
          <Dropdown
            trigger={
              <Button kind="secondary" icon="Cpu" iconRight="ChevronDown" aria-label={t("agentView.agentSelect")}>
                {agent.name}
              </Button>
            }
            items={agents.map((a) => ({ label: a.name, hint: a.model, onClick: () => url.selectAgent(a.agent_id) }))}
            align="right"
          />
          <RangeFilter value={range.value} onChange={pickRange} />
          {runButton}
          {control.activeRunId && (
            <Button kind="ghost" onClick={() => control.cancel(control.activeRunId!)}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </div>

      {control.progress && (
        <p style={s.subtitle}>
          {t("common.runProgress", { done: control.progress.done, total: control.progress.total })}
        </p>
      )}
      <div aria-live="polite" role="status" style={s.visuallyHidden}>
        {control.announce}
      </div>
      {control.error && (
        <div role="alert" style={{ ...s.notice, ...s.noticeWarn }}>
          {control.error}
        </div>
      )}
      {unavailable && (
        <div role="alert" style={{ ...s.notice, ...s.noticeWarn, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon.AlertTriangle size={14} aria-hidden="true" />
          <span style={{ flex: 1 }}>{t("common.runNotAvailable")}</span>
          <Button size="sm" kind="ghost" onClick={url.closeCompare}>
            {t("common.close")}
          </Button>
        </div>
      )}
      {url.compareIds && comparison.isLoading && (
        <p role="status" style={s.subtitle}>
          {t("compare.loading")}
        </p>
      )}

      {body}

      {comparison.data && !unavailable && <CompareRunsModal comparison={comparison.data} onClose={url.closeCompare} />}
    </div>
  );
}
