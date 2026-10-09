/* Eval Dashboard — overview of all agents, or one agent's runs (`?agent=`). All state is in the URL. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalOverview, useStartAllEvalRuns } from "@/lib/hooks/eval";
import { AgentView } from "../AgentView";
import { OverviewView } from "../OverviewView";
import { s } from "../styles";
import { useDashboardUrl } from "./useDashboardUrl";

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const url = useDashboardUrl();
  const { data, isLoading, isError, refetch } = useEvalOverview();

  const runAll = useStartAllEvalRuns();
  const [started, setStarted] = useState<number | null>(null);
  const onRunAll = () => runAll.mutate(undefined, { onSuccess: (res) => setStarted(res.run_ids.length) });
  const runAllStatus = started === null ? "" : started > 0 ? t("overview.runAllStarted", { count: started }) : t("overview.noAgentsToRun");

  const agent = url.agentId ? data?.agents.find((a) => a.agent_id === url.agentId) : undefined;
  const crumbLab = t.has("overview.crumbLab") ? t("overview.crumbLab") : "Skills Lab";
  const crumb = [
    { label: crumbLab },
    { label: t("overview.title"), ...(agent ? { href: "/eval" } : {}) },
    ...(agent ? [{ label: agent.name }] : []),
  ];

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div style={s.stack} aria-busy="true" data-testid="eval-skeleton">
        <Skeleton height={26} width={240} />
        <Skeleton height={76} />
        <Skeleton height={76} />
        <Skeleton height={76} />
      </div>
    );
  } else if (isError && !data) {
    body = <ErrorState title={t("errors.loadFailed")} body={t("errors.loadFailedBody")} onRetry={() => void refetch()} />;
  } else if (data && agent) {
    body = <AgentView agent={agent} agents={data.agents} url={url} />;
  } else if (data) {
    body = (
      <>
        <OverviewView
          overview={data}
          notFound={!!url.agentId}
          onOpenAgent={url.openAgent}
          onRunAll={onRunAll}
          runAllPending={runAll.isPending}
        />
        <div role="status" aria-live="polite" style={s.subtitle}>
          {runAllStatus}
        </div>
      </>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {isError && data && (
          <div role="alert" style={{ ...s.notice, ...s.noticeWarn, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ flex: 1 }}>
              {t("errors.loadFailed")}. {t("errors.loadFailedBody")}
            </span>
            <Button size="sm" onClick={() => void refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        )}
        {body}
      </div>
    </AppShell>
  );
}
