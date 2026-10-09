"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { BarRow, Button, Checkbox, Icon, type IconName } from "@devdigest/ui";
import type { EvalSuiteRunStatus, EvalSuiteRunSummary } from "@devdigest/shared";
import { fmtCost, fmtDate, fmtPct, hasMetrics, METRIC_COLOR, metricLabelKey, type MetricKey } from "../helpers";
import { s } from "../styles";

const STATUS_ICON: Record<EvalSuiteRunStatus, IconName> = {
  completed: "CheckCircle",
  partial: "AlertTriangle",
  failed: "XCircle",
  interrupted: "AlertTriangle",
  cancelled: "X",
  queued: "Clock",
  running: "Play",
};

const BAR_COLUMNS: { key: MetricKey; header: "recall" | "precision" | "citationAccuracy" }[] = [
  { key: "recall", header: "recall" },
  { key: "precision", header: "precision" },
  { key: "citation_accuracy", header: "citationAccuracy" },
];

/** A run's history with a compare selection. Only runs that carry metrics can be selected. */
export function RecentRunsTable({
  runs,
  selected,
  onToggle,
  onCompare,
  onCancel,
}: {
  runs: EvalSuiteRunSummary[];
  selected: string[];
  onToggle: (runId: string) => void;
  onCompare: () => void;
  onCancel: (runId: string) => void;
}) {
  const t = useTranslations("eval");

  return (
    <section>
      <div style={{ ...s.actions, marginTop: 24, marginBottom: 10, justifyContent: "space-between" }}>
        <h2 style={{ ...s.sectionLabel, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon.History size={13} /> {t("agentView.recentRuns")}
          <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }} aria-live="polite">
            {selected.length === 0 ? t("agentView.selectTwo") : t("agentView.selectedCount", { count: selected.length })}
          </span>
        </h2>
        <Button kind="primary" size="sm" icon="GitMerge" disabled={selected.length !== 2} onClick={onCompare}>
          {t("agentView.compare")}
        </Button>
      </div>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>
                <span style={s.visuallyHidden}>{t("runs.columns.select")}</span>
              </th>
              <th style={s.th}>{t("runs.columns.ranAt")}</th>
              <th style={s.th}>{t("runs.columns.version")}</th>
              {BAR_COLUMNS.map((c) => (
                <th key={c.key} style={s.th}>
                  {t(`runs.columns.${c.header}`)}
                </th>
              ))}
              <th style={s.th}>{t("runs.columns.casesPassed")}</th>
              <th style={s.th}>{t("runs.columns.cost")}</th>
              <th style={s.th}>{t("runs.columns.status")}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const version = t("common.version", { version: run.agent_version });
              const selectable = hasMetrics(run);
              const StatusIcon = Icon[STATUS_ICON[run.status]];
              const cost = fmtCost(run.cost_usd);
              return (
                <tr key={run.id}>
                  <td style={s.td}>
                    <div style={s.checkCell} title={selectable ? undefined : t("agentView.noMetricsForRun")}>
                      <Checkbox
                        checked={selected.includes(run.id)}
                        disabled={!selectable}
                        onChange={() => onToggle(run.id)}
                        label={<span style={s.visuallyHidden}>{t("agentView.selectRun", { version })}</span>}
                      />
                    </div>
                  </td>
                  <td className="mono" style={s.td}>
                    {fmtDate(run.started_at)}
                  </td>
                  <td className="mono" style={{ ...s.td, color: "var(--accent)" }}>
                    {version}
                  </td>
                  {BAR_COLUMNS.map((c) => (
                    <td key={c.key} style={s.td}>
                      {selectable ? (
                        <BarRow
                          label={t(`metrics.${metricLabelKey(c.key)}`)}
                          value={run[c.key] ?? 0}
                          max={1}
                          color={METRIC_COLOR[c.key]}
                          suffix={fmtPct(run[c.key])}
                        />
                      ) : (
                        t("common.dash")
                      )}
                    </td>
                  ))}
                  <td className="tnum" style={{ ...s.td, fontWeight: 600 }}>
                    {selectable ? t("metrics.passedOf", { passed: run.cases_passed ?? 0, total: run.cases_total }) : t("common.dash")}
                  </td>
                  <td className="mono" style={s.td} title={cost == null ? t("common.noCostTitle") : undefined}>
                    {cost == null ? t("common.dash") : t("common.costValue", { value: cost })}
                  </td>
                  <td style={s.td}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <StatusIcon size={13} aria-hidden="true" />
                      {t(`status.${run.status}`)}
                    </span>
                    {!selectable && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("agentView.noMetricsForRun")}</div>
                    )}
                    {(run.status === "queued" || run.status === "running") && (
                      <Button kind="ghost" size="sm" aria-label={`${t("common.cancel")} ${version}`} onClick={() => onCancel(run.id)}>
                        {t("common.cancel")}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
