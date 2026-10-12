/* InstallDone — success state after Install: PR link (or the zip note) and the what-next checklist (AC-21). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { InstallResult } from "../InstallStep";
import { step } from "../stepStyles";

const CHECKLIST_KEYS = [
  "exportWizard.checklist.secret",
  "exportWizard.checklist.merge",
  "exportWizard.checklist.required",
  "exportWizard.checklist.refresh",
] as const;

export function InstallDone({ result }: { result: InstallResult }) {
  const t = useTranslations("ci");
  return (
    <div style={step.body} role="status" aria-live="polite">
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
        <Icon.CheckCircle size={18} style={{ color: "var(--ok)" }} />
        {result.kind === "pr" ? t("exportWizard.doneTitle") : t("exportWizard.zipDoneTitle")}
      </div>
      {result.kind === "pr" ? (
        <div style={{ fontSize: 13 }}>
          {result.reused ? t("exportWizard.doneReused") : t("exportWizard.doneBody")}{" "}
          {result.prUrl && (
            <a href={result.prUrl} target="_blank" rel="noopener noreferrer" style={step.link}>
              {t("exportWizard.openPr")}
            </a>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13 }}>{t("exportWizard.zipDoneBody")}</div>
      )}
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
        {CHECKLIST_KEYS.map((k) => (
          <li key={k}>{t(k, { key: "OPENROUTER_API_KEY" })}</li>
        ))}
      </ol>
    </div>
  );
}
