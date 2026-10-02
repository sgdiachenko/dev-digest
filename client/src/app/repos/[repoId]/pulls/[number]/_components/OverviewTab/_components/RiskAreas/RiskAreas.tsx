/* RiskAreas — the brief's risks, rendered inside the Intent block. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { RiskItem } from "../RiskItem";
import { s } from "./styles";

export function RiskAreas({
  risks,
  changedFiles,
  onOpenFile,
}: {
  risks: Risk[];
  changedFiles: readonly string[];
  onOpenFile: (path: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  return (
    <div>
      <SectionLabel icon="AlertTriangle">{t("card.riskAreas")}</SectionLabel>
      {risks.length === 0 ? (
        <p style={s.empty}>{t("card.noRisks")}</p>
      ) : (
        <ul style={s.list}>
          {risks.map((risk, i) => (
            <RiskItem key={i} risk={risk} changedFiles={changedFiles} onOpenFile={onOpenFile} />
          ))}
        </ul>
      )}
    </div>
  );
}
