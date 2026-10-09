"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, LineChart } from "@devdigest/ui";
import type { EvalSuiteRunSummary } from "@devdigest/shared";
import { fmtCost, hasMetrics, METRIC_COLOR, METRIC_KEYS, metricLabelKey, newestFirst } from "../helpers";
import { s } from "../styles";

/** One point per finished run (oldest first). The chart has no hover, so every point also gets a focusable
    marker whose tooltip carries the version and cost. */
export function MetricTrendChart({ runs }: { runs: EvalSuiteRunSummary[] }) {
  const t = useTranslations("eval");
  const points = newestFirst(runs.filter(hasMetrics)).reverse();
  if (points.length < 2) return null;

  const series = METRIC_KEYS.map((m) => ({
    name: t(`metrics.${metricLabelKey(m)}`),
    color: METRIC_COLOR[m],
    data: points.map((r) => r[m] ?? 0),
  }));
  const floor = Math.min(...series.flatMap((x) => x.data));
  const yMin = Math.min(0.6, Math.floor(floor * 10) / 10);

  return (
    <section style={s.panel} aria-label={t("agentView.metricTrend")}>
      <h2 style={{ ...s.sectionLabel, margin: 0 }}>
        <Icon.TrendingUp size={13} /> {t("agentView.metricTrend")}
      </h2>
      <div style={{ display: "flex", gap: 16, justifyContent: "flex-end", fontSize: 12.5 }}>
        {series.map((x) => (
          <span key={x.name} style={{ color: x.color }}>
            ━ {x.name}
          </span>
        ))}
      </div>
      <LineChart series={series} yMin={yMin} yMax={1} w={1000} h={220} />
      <ul style={s.trendPoints}>
        {points.map((r) => {
          const tip = t("agentView.trendTooltip", {
            version: t("common.version", { version: r.agent_version }),
            cost: fmtCost(r.cost_usd) == null ? t("common.dash") : t("common.costValue", { value: fmtCost(r.cost_usd)! }),
          });
          return (
            <li key={r.id} tabIndex={0} title={tip} aria-label={tip} style={s.trendPoint}>
              {t("common.version", { version: r.agent_version })}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
