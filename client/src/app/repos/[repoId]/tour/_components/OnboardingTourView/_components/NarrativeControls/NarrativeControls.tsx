"use client";

import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api";
import { Button } from "@devdigest/ui";

/**
 * Generate / Regenerate button (the model and cost estimate live in NarrativeEstimate).
 * Disabled only while a generation runs; a 429 is shown as a message and the button stays usable.
 */
export function NarrativeControls({
  hasNarrative,
  generating,
  error,
  onGenerate,
}: {
  /** An earlier narrative exists, so the action regenerates rather than generates. */
  hasNarrative: boolean;
  generating: boolean;
  /** The last generate-request error (from the mutation), if any. */
  error?: unknown;
  onGenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const rateLimited = error instanceof ApiError && error.status === 429;
  return (
    <>
      <Button size="sm" icon="RefreshCw" disabled={generating} onClick={onGenerate}>
        {generating ? t("narrative.generating") : t(hasNarrative ? "narrative.regenerate" : "narrative.generate")}
      </Button>
      {rateLimited && (
        <span role="alert" style={{ fontSize: 12 }}>
          {t("narrative.rateLimited")}
        </span>
      )}
    </>
  );
}
