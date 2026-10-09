/* SuiteRunProgress — "k / N cases" while a suite run is in flight and, once it ends, the final status
   with its metrics. The region is a polite live region that is always mounted, so the announcement is
   read without moving focus (AC-86, AC-151, NFR-11). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { isActive, toPercent } from "../../helpers";
import { s } from "./styles";

export function SuiteRunProgress({ run }: { run: EvalSuiteRun | null | undefined }) {
  const t = useTranslations("eval");
  const dash = t("common.dash");
  const pct = (v: number | null) => {
    const p = toPercent(v);
    return p == null ? dash : `${p}%`;
  };

  let text: string | null = null;
  if (run) {
    text = isActive(run.status)
      ? t("common.runProgress", { done: run.cases_completed, total: run.cases_total })
      : t("runs.announceFinished", {
          status: t(`status.${run.status}`),
          recall: pct(run.recall),
          precision: pct(run.precision),
          citation: pct(run.citation_accuracy),
        });
  }

  return (
    <div role="status" aria-live="polite" style={text ? s.box : s.empty}>
      {run && text && (
        <>
          {isActive(run.status) ? <Icon.RefreshCw size={14} aria-hidden="true" /> : <Icon.Info size={14} aria-hidden="true" />}
          <span className="tnum">{text}</span>
        </>
      )}
    </div>
  );
}
