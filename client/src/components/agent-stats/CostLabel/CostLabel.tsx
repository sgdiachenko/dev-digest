"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { HoverHint } from "../HoverHint";
import { s } from "./styles";

/** "Recorded by DevDigest — not provider billing" with a keyboard-reachable info tooltip (AC-189). */
export function CostLabel() {
  const t = useTranslations("agentPerformance");
  return (
    <span style={s.wrap}>
      <span>{t("cost.label")}</span>
      <HoverHint text={t("cost.info")}>
        {(target) => (
          <button type="button" style={s.button} aria-label={t("cost.infoButton")} {...target}>
            <Icon.Info size={13} aria-hidden />
          </button>
        )}
      </HoverHint>
    </span>
  );
}
