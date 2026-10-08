"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "../styles";

/** `≈ total / budget tokens`; in the warning state names the documents injection would skip. */
export function BudgetMeter({
  total,
  budget,
  overBudget,
  skippedPaths,
}: {
  total: number;
  budget: number;
  overBudget: boolean;
  skippedPaths: string[];
}) {
  const t = useTranslations("context");
  return (
    <div style={{ ...s.meter, borderColor: overBudget ? "var(--crit)" : "var(--border)" }} aria-label={t("attachments.budget.label")}>
      <span className="tnum">{t("attachments.budget.total", { total, budget })}</span>
      {overBudget && (
        <span role="alert" style={s.warn}>
          {skippedPaths.length > 0
            ? t("attachments.budget.over", { paths: skippedPaths.join(", ") })
            : t("attachments.budget.overGeneric")}
        </span>
      )}
    </div>
  );
}
