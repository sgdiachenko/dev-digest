/* CaseBanner — Positive / Negative strip with the plain-text assertion (the model never sees it). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalCaseType, EvalExpectation } from "@devdigest/shared";
import { assertionText } from "../../../helpers";
import { s } from "../../styles";

export function CaseBanner({ type, expectation }: { type: EvalCaseType; expectation: EvalExpectation | null }) {
  const t = useTranslations("eval.modal");
  if (!expectation) return null;
  const negative = type === "must_not_flag";
  const a = assertionText(type, expectation);
  const I = negative ? Icon.XCircle : Icon.Target;
  return (
    <div style={s.banner(negative)} data-testid="case-banner">
      <I size={15} style={{ color: negative ? "var(--text-muted)" : "var(--accent)", flexShrink: 0 }} aria-hidden />
      <span style={s.bannerText}>
        <b style={s.bannerLabel(negative)}>{negative ? t("bannerNegative") : t("bannerPositive")}</b>
        {t(a.key, a.values)}
      </span>
    </div>
  );
}
