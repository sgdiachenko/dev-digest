"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MetricCard } from "@devdigest/ui";
import type { EvalSuiteRunSummary } from "@devdigest/shared";
import { deltaPts, hasMetrics, latestTwo, METRIC_COLOR, METRIC_KEYS, metricLabelKey, newestFirst, nullReasonKey, toPts } from "../helpers";
import { s } from "../styles";

/** Three KPI tiles for the newest run, with the change in points vs the run before (none when only one run). */
export function AgentMetricCards({ runs }: { runs: EvalSuiteRunSummary[] }) {
  const t = useTranslations("eval");
  const [latest, prev] = latestTwo(runs);
  if (!latest) return null;
  const chronological = newestFirst(runs.filter(hasMetrics)).reverse();

  return (
    <div style={s.cards}>
      {METRIC_KEYS.map((m) => {
        const pts = toPts(latest[m]);
        const delta = deltaPts(latest[m], prev?.[m] ?? null);
        const trend = chronological.map((r) => r[m]).filter((v): v is number => v != null);
        return (
          <div key={m} style={s.cardCell}>
            <MetricCard
              label={t(`metrics.${metricLabelKey(m)}Upper`)}
              color={METRIC_COLOR[m]}
              trend={trend.length >= 2 ? trend : undefined}
              value={
                pts == null ? (
                  <>
                    {t("common.dash")}
                    <span style={{ ...s.delta, color: "var(--text-muted)" }}>{t(`metrics.${nullReasonKey(m)}`)}</span>
                  </>
                ) : (
                  <>
                    {pts}
                    <span style={{ fontSize: 18, color: "var(--text-muted)" }}>%</span>
                    {delta != null && (
                      <span
                        style={{
                          ...s.delta,
                          color: delta === 0 ? "var(--text-muted)" : delta > 0 ? "var(--ok)" : "var(--crit)",
                        }}
                      >
                        {delta === 0
                          ? t("metrics.changeSame")
                          : t(delta > 0 ? "metrics.changeUp" : "metrics.changeDown", { value: Math.abs(delta) })}
                      </span>
                    )}
                  </>
                )
              }
            />
          </div>
        );
      })}
    </div>
  );
}
