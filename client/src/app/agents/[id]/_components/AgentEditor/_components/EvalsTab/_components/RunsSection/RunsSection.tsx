/* RunsSection — the 10 most recent suite runs of the agent, newest first, and a link to the full
   dashboard (AC-78, AC-96, AC-97, AC-178). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalSuiteRunStatus, EvalSuiteRunSummary } from "@devdigest/shared";
import { formatCost, formatRanAt, newestFirst, toPercent } from "../../helpers";
import { s } from "./styles";

const MAX_RUNS = 10;
const COLUMNS = ["ranAt", "version", "recall", "precision", "citationAccuracy", "casesPassed", "cost", "status"] as const;

const STATUS_VISUAL: Record<EvalSuiteRunStatus, { icon: "CheckCircle" | "AlertTriangle" | "XCircle" | "Clock" | "RefreshCw"; color: string }> = {
  completed: { icon: "CheckCircle", color: "var(--ok)" },
  partial: { icon: "AlertTriangle", color: "var(--warn)" },
  failed: { icon: "XCircle", color: "var(--crit)" },
  interrupted: { icon: "AlertTriangle", color: "var(--warn)" },
  cancelled: { icon: "XCircle", color: "var(--text-muted)" },
  queued: { icon: "Clock", color: "var(--text-muted)" },
  running: { icon: "RefreshCw", color: "var(--accent)" },
};

export function RunsSection({ agentId, runs }: { agentId: string; runs: EvalSuiteRunSummary[] }) {
  const t = useTranslations("eval");
  const dash = t("common.dash");
  const rows = newestFirst(runs).slice(0, MAX_RUNS);
  const pct = (v: number | null) => {
    const p = toPercent(v);
    return p == null ? dash : `${p}%`;
  };

  return (
    <section aria-labelledby="eval-runs-title" style={s.wrap}>
      <div style={s.header}>
        <h2 id="eval-runs-title" style={s.title}>
          {t("runs.title")}
        </h2>
        <Link href={`/eval?agent=${encodeURIComponent(agentId)}`} style={s.link}>
          {t("runs.viewDashboard")}
        </Link>
      </div>
      {rows.length === 0 ? (
        <div style={s.empty}>{t("runs.empty")}</div>
      ) : (
        <div style={s.scroll}>
          <table style={s.table}>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c} scope="col" style={s.th}>
                    {t(`runs.columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cost = formatCost(r.cost_usd);
                const visual = STATUS_VISUAL[r.status];
                const StatusIcon = Icon[visual.icon];
                return (
                  <tr key={r.id}>
                    <td style={s.td}>{formatRanAt(r.started_at)}</td>
                    <td style={s.td}>{t("common.version", { version: r.agent_version })}</td>
                    <td className="tnum" style={s.td}>{pct(r.recall)}</td>
                    <td className="tnum" style={s.td}>{pct(r.precision)}</td>
                    <td className="tnum" style={s.td}>{pct(r.citation_accuracy)}</td>
                    <td className="tnum" style={s.td}>
                      {r.cases_passed == null ? dash : t("metrics.passedOf", { passed: r.cases_passed, total: r.cases_total })}
                    </td>
                    <td className="tnum" style={s.td} title={cost == null ? t("common.noCostTitle") : undefined}>
                      {cost == null ? dash : t("common.costValue", { value: cost })}
                    </td>
                    <td style={{ ...s.td, color: visual.color }}>
                      <span style={s.status}>
                        <StatusIcon size={14} aria-hidden="true" />
                        {t(`status.${r.status}`)}
                        {r.cases_errored > 0 && ` · ${t("runs.erroredCases", { count: r.cases_errored })}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
