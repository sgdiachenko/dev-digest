"use client";

import { useTranslations } from "next-intl";
import type { OnboardingEstimatedCost } from "@/lib/types";
import { formatUsd } from "../../helpers";
import { s } from "../../styles";

/** The model and an approximate generation cost, as a small muted line under the title row. */
export function NarrativeEstimate({ estimatedCost }: { estimatedCost: OnboardingEstimatedCost | null }) {
  const t = useTranslations("onboarding");
  if (!estimatedCost) return null;
  const cost =
    estimatedCost.approx_usd != null
      ? t("narrative.approx", { cost: formatUsd(estimatedCost.approx_usd) })
      : t("narrative.costUnknown");
  return (
    <span style={s.muted}>
      {estimatedCost.model} · {cost}
    </span>
  );
}
