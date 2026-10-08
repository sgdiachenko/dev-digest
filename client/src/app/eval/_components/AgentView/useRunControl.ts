"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun, EvalSuiteRunSummary } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCancelEvalRun, useEvalRun, useStartEvalRun } from "@/lib/hooks/eval";
import { fmtPct, isActive } from "../helpers";

export interface RunControl {
  /** The run currently queued/running for this agent (started here or found in the list), if any. */
  activeRunId: string | null;
  progress: { done: number; total: number } | null;
  /** Polite live-region text: progress while running, a summary once it finished. */
  announce: string;
  error: string | null;
  starting: boolean;
  start: () => void;
  cancel: (runId: string) => void;
}

/** Starting, following and cancelling the agent's suite run. Joins a run that is already active (AC-83, AC-151). */
export function useRunControl(agentId: string, runs: EvalSuiteRunSummary[], onSettled: () => void): RunControl {
  const t = useTranslations("eval");
  const startRun = useStartEvalRun(agentId);
  const cancelRun = useCancelEvalRun(agentId);
  const [startedId, setStartedId] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const wasActive = React.useRef(false);

  const trackedId = runs.find(isActive)?.id ?? startedId;
  const { data: run } = useEvalRun(trackedId);
  const active = !!trackedId && (!run || isActive(run));

  const status = run?.status;
  const done = run?.cases_completed;
  const total = run?.cases_total;
  React.useEffect(() => {
    if (!run) return;
    if (isActive(run)) {
      wasActive.current = true;
      setAnnounce(t("runs.announceProgress", { done: run.cases_completed, total: run.cases_total }));
    } else if (wasActive.current) {
      wasActive.current = false;
      setAnnounce(finishedText(t, run));
      onSettled();
    }
    // keyed on the fields that change what is announced, not on `run` identity (it changes every poll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, done, total]);

  const errorText = (e: unknown): string => {
    const code = e instanceof ApiError ? e.code : undefined;
    return code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.runStartFailed");
  };

  return {
    activeRunId: active ? trackedId : null,
    progress: active && run ? { done: run.cases_completed, total: run.cases_total } : null,
    announce,
    error,
    starting: startRun.isPending,
    start: () => {
      setError(null);
      startRun.mutate(undefined, {
        onSuccess: (res) => setStartedId(res.run_id),
        onError: (e) => setError(errorText(e)),
      });
    },
    cancel: (runId) => {
      cancelRun.mutate(runId, { onError: (e) => setError(errorText(e)) });
    },
  };
}

function finishedText(t: ReturnType<typeof useTranslations<"eval">>, run: EvalSuiteRun): string {
  return t("runs.announceFinished", {
    status: t(`status.${run.status}`),
    recall: fmtPct(run.recall),
    precision: fmtPct(run.precision),
    citation: fmtPct(run.citation_accuracy),
  });
}
