"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingNarrative } from "@/lib/types";
import { formatUsd, relativeTime } from "../../helpers";

const chip = {
  border: "1px solid var(--warn)",
  borderRadius: 999,
  padding: "1px 10px",
  fontSize: 12,
  color: "var(--warn)",
  background: "var(--warn-bg)",
} as const;

/** "Generated … from commit … · model · cost", the Outdated chip, and an inline failure with its remedy. */
export function NarrativeStatus({
  narrative,
  onRetry,
}: {
  narrative: OnboardingNarrative | null;
  onRetry: () => void;
}) {
  const t = useTranslations("onboarding");
  if (!narrative) return null;

  const failure = narrative.status === "failed" ? narrative.last_failure : null;
  const showGenerated = narrative.generated_at != null && narrative.source_sha != null;
  const cost = narrative.cost_usd != null ? formatUsd(narrative.cost_usd) : t("narrative.costNotReported");

  let reasonText = "";
  let remedy: { href: string; label: string } | null = null;
  if (failure) {
    if (failure.reason === "missing_key") {
      reasonText = t("narrative.missingKey", { provider: failure.provider ?? "" });
      remedy = { href: "/settings/api-keys", label: t("narrative.openSettings") };
    } else if (failure.reason === "no_structured_provider") {
      reasonText = t("narrative.noStructuredProvider", { model: failure.model ?? "" });
      remedy = { href: "/settings/models", label: t("narrative.openSettings") };
    } else {
      reasonText = t(`narrative.failure.${failure.reason}`);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
      {(showGenerated || narrative.outdated) && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          {showGenerated && (
            <span>
              {t("narrative.generatedLine", {
                time: relativeTime(narrative.generated_at),
                sha: (narrative.source_sha ?? "").slice(0, 7),
                model: narrative.model ?? "",
                cost,
              })}
            </span>
          )}
          {narrative.outdated && <span style={chip}>{t("narrative.outdated")}</span>}
        </div>
      )}
      {failure && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <span style={{ color: "var(--crit)" }}>{reasonText}</span>
          {remedy && <Link href={remedy.href} style={{ color: "var(--accent-text)" }}>{remedy.label}</Link>}
          <Button size="sm" onClick={onRetry}>
            {t("narrative.retry")}
          </Button>
        </div>
      )}
    </div>
  );
}
