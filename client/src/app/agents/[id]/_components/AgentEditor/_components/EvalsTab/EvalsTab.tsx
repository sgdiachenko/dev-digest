/* EvalsTab — Agents › Evals: metric tiles of the latest finished run, standing notes, the eval cases and
   the run history. Owns the data (cases, runs, the tracked suite run); the sections below are
   presentational plus their own mutations (AC-59, AC-86, AC-116, AC-151, AC-179, AC-180). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import { evalKeys, useEvalCases, useEvalRun, useEvalRuns } from "@/lib/hooks/eval";
import { isActive, isFinished, latestFinishedPair } from "./helpers";
import { EvalMetricTiles } from "./_components/EvalMetricTiles";
import { EvalNotes } from "./_components/EvalNotes";
import { SuiteRunProgress } from "./_components/SuiteRunProgress";
import { EvalCasesSection } from "./_components/EvalCasesSection";
import { RunsSection } from "./_components/RunsSection";
import { s } from "./styles";

/** AC-70: fewer cases than this (or one case type only) makes the metrics noisy. */
const MIN_SET_SIZE = 8;

export function EvalsTab({ agentId, agentName }: { agentId: string; agentName: string }) {
  const t = useTranslations("eval");
  const qc = useQueryClient();
  const cases = useEvalCases(agentId);
  const runs = useEvalRuns(agentId);

  // The run being tracked: the one this tab started or joined, else one already in flight.
  const [trackedId, setTrackedId] = React.useState<string | null>(null);
  const inFlightId = runs.data?.find((r) => isActive(r.status))?.id ?? null;
  const runId = trackedId ?? inFlightId;
  const run = useEvalRun(runId).data ?? null;

  // A finished run changes every case's last result and the run history.
  const finishedStatus = run && !isActive(run.status) ? run.status : null;
  React.useEffect(() => {
    if (!finishedStatus) return;
    qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) });
    qc.invalidateQueries({ queryKey: evalKeys.runs(agentId) });
  }, [finishedStatus, runId, agentId, qc]);

  const retry = () => {
    cases.refetch();
    runs.refetch();
  };

  if (cases.isLoading || runs.isLoading) {
    return (
      <div style={s.skeletons} aria-busy="true" aria-label={t("common.loading")}>
        <Skeleton height={96} />
        <Skeleton height={28} width={240} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  }
  if ((cases.isError && !cases.data) || (runs.isError && !runs.data)) {
    return <ErrorState title={t("errors.loadFailed")} body={t("errors.loadFailedBody")} onRetry={retry} />;
  }

  const caseList = cases.data ?? [];
  const runList = runs.data ?? [];
  const { latest, previous } = latestFinishedPair(runList);
  const hasPositive = caseList.some((c) => c.type === "must_find");
  const hasNegative = caseList.some((c) => c.type === "must_not_flag");
  const smallSet = caseList.length > 0 && (caseList.length < MIN_SET_SIZE || !hasPositive || !hasNegative);

  return (
    <div style={s.wrap}>
      {(cases.isError || runs.isError) && (
        <div role="alert" style={s.staleBanner}>
          <span>{t("errors.loadFailedBody")}</span>
          <Button size="sm" onClick={retry}>
            {t("common.retry")}
          </Button>
        </div>
      )}
      <EvalMetricTiles latest={latest && isFinished(latest.status) ? latest : null} previous={previous} />
      <EvalNotes showSmallSetHint={smallSet} />
      <SuiteRunProgress run={run} />
      <EvalCasesSection
        agentId={agentId}
        agentName={agentName}
        cases={caseList}
        activeRun={run}
        onRunStarted={setTrackedId}
      />
      <RunsSection agentId={agentId} runs={runList} />
    </div>
  );
}
