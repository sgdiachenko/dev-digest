/* EvalNotes — the two standing notes about how scores are produced (AC-95) and, for a small or
   one-sided case set, the "metrics are noisy" hint (AC-70). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function EvalNotes({ showSmallSetHint }: { showSmallSetHint: boolean }) {
  const t = useTranslations("eval.common");
  return (
    <div style={s.wrap}>
      <p style={s.note}>
        <Icon.Info size={13} aria-hidden="true" /> {t("variabilityNote")}
      </p>
      <p style={s.note}>
        <Icon.Info size={13} aria-hidden="true" /> {t("mechanicalNote")}
      </p>
      {showSmallSetHint && (
        <p style={s.hint}>
          <Icon.AlertTriangle size={13} aria-hidden="true" /> {t("smallSetHint")}
        </p>
      )}
    </div>
  );
}
