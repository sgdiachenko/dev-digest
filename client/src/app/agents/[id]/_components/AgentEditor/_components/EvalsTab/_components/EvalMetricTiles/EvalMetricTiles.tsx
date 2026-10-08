/* EvalMetricTiles — Recall / Precision / Citation accuracy / Cases passed of the latest finished run,
   with the change in points against the finished run before it (AC-93, AC-175..177, AC-99). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalSuiteRunSummary } from "@devdigest/shared";
import { deltaPoints, toPercent } from "../../helpers";
import { s } from "./styles";

type PercentMetric = "recall" | "precision" | "citation_accuracy";

const PERCENT_METRICS: readonly { key: PercentMetric; labelKey: "recall" | "precision" | "citationAccuracy" }[] = [
  { key: "recall", labelKey: "recall" },
  { key: "precision", labelKey: "precision" },
  { key: "citation_accuracy", labelKey: "citationAccuracy" },
];

export function EvalMetricTiles({
  latest,
  previous,
}: {
  latest: EvalSuiteRunSummary | null;
  previous: EvalSuiteRunSummary | null;
}) {
  const t = useTranslations("eval");
  const dash = t("common.dash");

  return (
    <div style={s.row}>
      {PERCENT_METRICS.map(({ key, labelKey }) => {
        const percent = latest ? toPercent(latest[key]) : null;
        const delta = latest && previous && percent != null ? deltaPoints(latest[key], previous[key]) : null;
        const nullReason = latest && percent == null ? t(`metrics.nullReason${upperFirst(labelKey)}`) : undefined;
        return (
          <div key={key} role="group" aria-label={t(`metrics.${labelKey}`)} style={s.tile}>
            <span style={s.label}>{t(`metrics.${labelKey}`)}</span>
            <div style={s.valueRow}>
              <span className="tnum" style={s.value} title={nullReason}>
                {percent == null ? dash : `${percent}%`}
              </span>
              {delta != null && <Delta points={delta} />}
            </div>
          </div>
        );
      })}
      <div role="group" aria-label={t("metrics.casesPassed")} style={s.tile}>
        <span style={s.label}>{t("metrics.casesPassed")}</span>
        <div style={s.valueRow}>
          <span className="tnum" style={s.value}>
            {latest && latest.cases_passed != null
              ? t("metrics.passedOf", { passed: latest.cases_passed, total: latest.cases_total })
              : dash}
          </span>
        </div>
      </div>
    </div>
  );
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Change in points: arrow icon plus text, never colour alone (NFR-11). */
function Delta({ points }: { points: number }) {
  const t = useTranslations("eval");
  const text =
    points === 0
      ? t("metrics.changeSame")
      : points > 0
        ? t("metrics.changeUp", { value: points })
        : t("metrics.changeDown", { value: Math.abs(points) });
  const color = points === 0 ? "var(--text-muted)" : points > 0 ? "var(--ok)" : "var(--crit)";
  const I = points === 0 ? Icon.Slash : points > 0 ? Icon.ArrowUp : Icon.ArrowDown;
  return (
    <span style={{ ...s.delta, color }}>
      <I size={12} aria-hidden="true" />
      <span className="tnum">{text}</span>
    </span>
  );
}
