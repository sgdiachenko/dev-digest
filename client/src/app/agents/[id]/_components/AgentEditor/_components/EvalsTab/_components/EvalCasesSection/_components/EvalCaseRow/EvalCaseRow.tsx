/* EvalCaseRow — one eval case: status (icon + text), mono name, type tag, "expected N, got M", expectation
   badge, provenance, and Run / Edit / Delete that appear on hover and focus-within (AC-60, AC-67, AC-69,
   AC-85, AC-118, AC-173, AC-174). The row opens the case from the keyboard with Enter / Space. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn } from "@devdigest/ui";
import type { EvalCase, EvalCaseResult } from "@devdigest/shared";
import { useEvalAttempt, useStartCaseAttempt } from "@/lib/hooks/eval";
import type { InRunStatus } from "../../helpers";
import { s } from "./styles";

type RowStatus = InRunStatus | "never";

const STATUS_VISUAL: Record<RowStatus, { icon: "CheckCircle" | "XCircle" | "AlertTriangle" | "Dot" | "Clock" | "RefreshCw"; color: string }> = {
  pass: { icon: "CheckCircle", color: "var(--ok)" },
  fail: { icon: "XCircle", color: "var(--crit)" },
  error: { icon: "AlertTriangle", color: "var(--warn)" },
  never: { icon: "Dot", color: "var(--text-muted)" },
  queued: { icon: "Clock", color: "var(--text-muted)" },
  running: { icon: "RefreshCw", color: "var(--accent)" },
};

const STATUS_LABEL: Record<RowStatus, "pass" | "fail" | "error" | "neverRun" | "queued" | "running"> = {
  pass: "pass",
  fail: "fail",
  error: "error",
  never: "neverRun",
  queued: "queued",
  running: "running",
};

export function EvalCaseRow({
  evalCase,
  inRun,
  onOpen,
  onDelete,
}: {
  evalCase: EvalCase;
  inRun: InRunStatus | null;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval");
  const [hovered, setHovered] = React.useState(false);
  const [focusWithin, setFocusWithin] = React.useState(false);
  const [attemptId, setAttemptId] = React.useState<string | null>(null);
  const startAttempt = useStartCaseAttempt();
  const attempt = useEvalAttempt(attemptId);

  const attemptRunning = startAttempt.isPending || attempt.data?.status === "running";
  const attemptResult: EvalCaseResult | null = attempt.data?.result ?? null;
  const last = evalCase.last_result;

  const status: RowStatus = attemptRunning
    ? "running"
    : attemptResult
      ? attemptResult.status
      : (inRun ?? last?.status ?? "never");
  const counts = attemptResult
    ? { expected: attemptResult.expected_count, got: attemptResult.actual_count }
    : last && !inRun
      ? { expected: last.expected_count, got: last.actual_count }
      : null;
  const showCounts = counts != null && (status === "pass" || status === "fail");
  const errorText = attemptResult?.status === "error" ? errorMessage(t, attemptResult.error_reason) : null;
  const startFailed = startAttempt.isError || attempt.isError || (attempt.data?.status === "error" && !attemptResult);

  const run = () => {
    if (attemptRunning) return;
    setAttemptId(null);
    startAttempt.mutate(evalCase.id, { onSuccess: (res) => setAttemptId(res.attempt_id) });
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  const visual = STATUS_VISUAL[status];
  const StatusIcon = Icon[visual.icon];
  const exp = evalCase.expectations[0];
  const badge =
    evalCase.type === "must_find" && exp?.severity && exp.category
      ? t("casesSection.badgeExpectation", { severity: exp.severity, category: exp.category })
      : t("casesSection.badgeEmpty");
  const actionsShown = hovered || focusWithin;

  return (
    <div
      style={s.row}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
      }}
    >
      <div style={s.top}>
        <div
          role="button"
          tabIndex={0}
          aria-label={t("casesSection.openCase", { name: evalCase.name })}
          title={evalCase.name}
          style={s.main}
          onClick={onOpen}
          onKeyDown={onKeyDown}
        >
          <span style={{ ...s.statusIcon, color: visual.color }}>
            <StatusIcon size={18} aria-hidden="true" />
          </span>
          <div style={s.text}>
            <span className="mono" style={s.name}>
              {evalCase.name}
            </span>
            <div style={s.meta}>
              <span style={{ color: visual.color, fontWeight: 600 }}>{t(`status.${STATUS_LABEL[status]}`)}</span>
              <span style={s.tag}>{evalCase.type === "must_find" ? t("modal.typeMustFind") : t("modal.typeMustNotFlag")}</span>
              {showCounts && <span>{t("casesSection.expectedGot", { expected: counts.expected, got: counts.got })}</span>}
              {errorText && <span>{errorText}</span>}
              {startFailed && <span>{t("errors.runStartFailed")}</span>}
            </div>
          </div>
        </div>
        <Badge mono>{badge}</Badge>
        <div style={{ ...s.actions, opacity: actionsShown ? 1 : 0 }}>
          <IconBtn icon="Play" size={28} label={t("casesSection.runCase", { name: evalCase.name })} onClick={run} />
          <IconBtn icon="Edit" size={28} label={t("casesSection.editCase", { name: evalCase.name })} onClick={onOpen} />
          <IconBtn icon="Trash" size={28} danger label={t("casesSection.deleteCase", { name: evalCase.name })} onClick={onDelete} />
        </div>
      </div>
      {evalCase.source && (
        <div style={s.provenance}>
          <span>
            {t("casesSection.fromFinding", {
              title: evalCase.source.finding_title,
              number: evalCase.source.pr_number,
              state: t(evalCase.source.triage === "accepted" ? "modal.provenanceAccepted" : "modal.provenanceDismissed"),
            })}
          </span>
          <Link href={`/repos/${evalCase.source.repo_id}/pulls/${evalCase.source.pr_number}`} style={s.link}>
            {t("casesSection.viewPr", { number: evalCase.source.pr_number })}
          </Link>
        </div>
      )}
    </div>
  );
}

function errorMessage(t: ReturnType<typeof useTranslations>, reason: EvalCaseResult["error_reason"]): string {
  return t(`errors.${reason ?? "unknown"}`);
}
