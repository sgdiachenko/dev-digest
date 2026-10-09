"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { EvalSuiteRunSummary } from "@devdigest/shared";
import { findRegression, metricLabelKey } from "../helpers";
import { s } from "../styles";

/** Shown only when the newest run lost >= 5 points on a metric; the text is computed, never canned (AC-113). */
export function RegressionAlert({ runs }: { runs: EvalSuiteRunSummary[] }) {
  const t = useTranslations("eval");
  const [dismissedKey, setDismissedKey] = React.useState<string | null>(null);
  const regression = findRegression(runs);
  if (!regression) return null;
  const key = `${regression.metric}:${regression.from}:${regression.to}`;
  if (dismissedKey === key) return null;

  return (
    <div role="status" style={{ ...s.notice, ...s.noticeWarn, display: "flex", alignItems: "center", gap: 10 }}>
      <Icon.AlertTriangle size={16} aria-hidden="true" />
      <span style={{ flex: 1, fontWeight: 600 }}>
        {t("agentView.regressionAlert", {
          metric: t(`metrics.${metricLabelKey(regression.metric)}`),
          points: regression.points,
          to: t("common.version", { version: regression.to }),
          from: t("common.version", { version: regression.from }),
        })}
      </span>
      <Button kind="tertiary" size="sm" icon="X" aria-label={t("agentView.dismissAlert")} onClick={() => setDismissedKey(key)} />
    </div>
  );
}
