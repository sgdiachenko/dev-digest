/* ResultPanel — the outcome of "Run case": progress, result with per-finding marks, error with its
   reason, interrupted and outdated notes. One polite live region, focus never moves (NFR-11). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalAttempt, EvalCaseResult, EvalFindingMatch } from "@devdigest/shared";
import { rangeLabel } from "../../../helpers";
import { s } from "../../styles";

const MATCH_KEY: Record<EvalFindingMatch, "matched" | "unmatched" | "forbiddenHit"> = {
  matched: "matched",
  unmatched: "unmatched",
  forbidden_hit: "forbiddenHit",
};

const MATCH_COLOR: Record<EvalFindingMatch, string> = {
  matched: "var(--ok)",
  unmatched: "var(--text-muted)",
  forbidden_hit: "var(--crit)",
};

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function formatCost(usd: number): string {
  return String(Number(usd.toPrecision(2)));
}

const KNOWN_REASONS = ["missing_key", "provider_error", "timeout", "invalid_output"];

export function ResultPanel({
  progressSeconds,
  attempt,
  outdated,
  interrupted,
  startError,
}: {
  /** Seconds elapsed while a run is in flight; null when nothing is running. */
  progressSeconds: number | null;
  attempt: EvalAttempt | null;
  outdated: boolean;
  interrupted: boolean;
  startError: string | null;
}) {
  const t = useTranslations("eval.modal");
  const tErr = useTranslations("eval.errors");
  const tCommon = useTranslations("eval.common");
  const result = attempt?.result ?? null;

  let tone: "ok" | "crit" | "warn" | "muted" = "muted";
  let body: React.ReactNode;

  if (progressSeconds !== null) {
    body = (
      <div style={s.resultHead}>
        <Icon.RefreshCw size={15} aria-hidden />
        <span>{t("running", { seconds: progressSeconds })}</span>
      </div>
    );
  } else if (interrupted) {
    tone = "warn";
    body = (
      <div style={s.resultHead}>
        <Icon.AlertTriangle size={15} style={{ color: "var(--warn)" }} aria-hidden />
        <span style={s.resultStrong}>{t("result.interrupted")}</span>
      </div>
    );
  } else if (startError) {
    tone = "crit";
    body = (
      <div style={s.resultHead}>
        <Icon.AlertTriangle size={15} style={{ color: "var(--crit)" }} aria-hidden />
        <span>{startError}</span>
      </div>
    );
  } else if (attempt && (!result || result.status === "error")) {
    tone = "crit";
    const reason = result?.error_reason;
    body = (
      <>
        <div style={s.resultHead}>
          <Icon.AlertTriangle size={15} style={{ color: "var(--crit)" }} aria-hidden />
          <span style={s.resultStrong}>{t("result.errorTitle")}</span>
        </div>
        <span>{tErr(reason && KNOWN_REASONS.includes(reason) ? reason : "unknown")}</span>
        {reason === "missing_key" && (
          <Link href="/settings/api-keys" style={s.link}>
            {tCommon("settingsApiKeys")}
          </Link>
        )}
      </>
    );
  } else if (result) {
    const pass = result.status === "pass";
    tone = pass ? "ok" : "crit";
    body = <ResultBody result={result} pass={pass} outdated={outdated} />;
  } else {
    body = <span>{t("result.empty")}</span>;
  }

  return (
    <div role="status" aria-live="polite" style={s.result(tone)} data-testid="result-panel">
      {body}
    </div>
  );
}

function ResultBody({ result, pass, outdated }: { result: EvalCaseResult; pass: boolean; outdated: boolean }) {
  const t = useTranslations("eval.modal");
  const I = pass ? Icon.CheckCircle : Icon.XCircle;
  return (
    <div style={{ opacity: outdated ? 0.7 : 1, display: "flex", flexDirection: "column", gap: 8 }}>
      {outdated && <span style={s.outdated}>{t("result.outdated")}</span>}
      <div style={s.resultHead}>
        <I size={16} style={{ color: pass ? "var(--ok)" : "var(--crit)" }} aria-hidden />
        <span>
          <b style={s.resultStrong}>{pass ? t("result.passed") : t("result.failed")}</b>
          {" · "}
          {t("result.expectedGot", { expected: result.expected_count, got: result.actual_count })}
          {result.duration_ms !== null && ` · ${t("result.duration", { seconds: formatSeconds(result.duration_ms) })}`}
          {" · "}
          {result.cost_usd === null ? t("result.costUnknown") : t("result.cost", { cost: formatCost(result.cost_usd) })}
        </span>
      </div>
      {result.actual_findings.length === 0 && result.dropped_findings.length === 0 ? (
        <span>{t("result.noFindings")}</span>
      ) : (
        <>
          {result.actual_findings.length > 0 && (
            <ul style={s.findingList} aria-label={t("result.keptFindings")}>
              {result.actual_findings.map((f, i) => (
                <li key={`${f.file}:${f.start_line}:${i}`} style={s.findingRow}>
                  <span style={{ color: MATCH_COLOR[f.match], fontWeight: 600 }}>{t(`result.${MATCH_KEY[f.match]}`)}</span>
                  <span>{f.title}</span>
                  <span style={s.mono}>
                    {f.file}:{rangeLabel(f)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.dropped_findings.length > 0 && (
            <ul style={s.findingList} aria-label={t("result.droppedFindings")}>
              {result.dropped_findings.map((d, i) => (
                <li key={`${d.finding.file}:${d.finding.start_line}:${i}`} style={s.findingRow}>
                  <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{t("result.droppedFindings")}</span>
                  <span>{d.finding.title}</span>
                  <span style={s.mono}>
                    {d.finding.file}:{rangeLabel(d.finding)}
                  </span>
                  <span>— {d.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
