/* InstallStep — "Open a PR with these files" (default) or "Copy files as a zip", the token permissions it needs,
   and the Install action (AC-17, AC-18, AC-20–AC-22, AC-126, AC-128). The zip path makes no request (AC-19). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { CI_PATHS, type CiFile } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useExportCi } from "@/lib/hooks/ci";
import { needsSettings } from "../../../../helpers";
import { PERMISSION_KEYS } from "../../constants";
import { downloadZip } from "../../download";
import { buildZip, effectiveFiles, type WizardConfig } from "../../helpers";
import { step } from "../stepStyles";

export type InstallResult = { kind: "pr"; prUrl: string | null; reused: boolean } | { kind: "zip" };

type Mode = "pr" | "zip";

export function InstallStep({
  agentId,
  config,
  files,
  workflowEdit,
  onInstalled,
}: {
  agentId: string;
  config: WizardConfig;
  files: CiFile[];
  workflowEdit: string | null;
  onInstalled: (result: InstallResult) => void;
}) {
  const t = useTranslations("ci");
  const exportCi = useExportCi(agentId);
  const [mode, setMode] = React.useState<Mode>("pr");
  const [error, setError] = React.useState<{ message: string; code: string | undefined } | null>(null);
  const installing = exportCi.isPending;

  const install = () => {
    setError(null);
    if (mode === "zip") {
      downloadZip(buildZip(effectiveFiles(files, workflowEdit)), "devdigest-ci.zip");
      onInstalled({ kind: "zip" });
      return;
    }
    exportCi.mutate(
      {
        repo: config.repo,
        target: "gha",
        action: "open_pr",
        post_as: config.postAs,
        triggers: config.triggers,
        workflow_contents: workflowEdit,
      },
      {
        onSuccess: (res) => onInstalled({ kind: "pr", prUrl: res.pr_url, reused: res.pr_reused }),
        onError: (e) =>
          setError({ message: e instanceof Error ? e.message : String(e), code: e instanceof ApiError ? e.code : undefined }),
      },
    );
  };

  return (
    <div style={step.body}>
      <fieldset style={{ border: "none", padding: 0, margin: 0 }} disabled={installing}>
        <label style={{ ...step.card, ...(mode === "pr" ? step.cardOn : null), marginBottom: 8 }}>
          <input type="radio" name="ci-install-mode" checked={mode === "pr"} onChange={() => setMode("pr")} />
          <div>
            <div style={{ fontWeight: 600 }}>
              {t("exportWizard.installCardTitle")} <span style={step.hint}>{t("exportWizard.recommended")}</span>
            </div>
            <div style={step.hint}>
              {t("exportWizard.installCardBody", { repo: config.repo, branch: CI_PATHS.BRANCH, count: files.length })}
            </div>
          </div>
        </label>
        <label style={{ ...step.card, ...(mode === "zip" ? step.cardOn : null) }}>
          <input type="radio" name="ci-install-mode" checked={mode === "zip"} onChange={() => setMode("zip")} />
          <div>
            <div style={{ fontWeight: 600 }}>{t("exportWizard.zipCardTitle")}</div>
            <div style={step.hint}>{t("exportWizard.zipCardBody")}</div>
          </div>
        </label>
      </fieldset>

      {mode === "pr" && (
        <div>
          <div style={step.label}>{t("exportWizard.permissionsTitle")}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
            {PERMISSION_KEYS.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </div>
      )}

      <div role="alert" style={step.error}>
        {error && (
          <>
            {error.message}
            {needsSettings(error.code) && (
              <>
                {" "}
                <Link href="/settings/api-keys" style={step.link}>
                  {t("settingsLink")}
                </Link>
              </>
            )}
          </>
        )}
      </div>

      <div>
        <Button kind="primary" icon="Play" disabled={installing} onClick={install}>
          {installing ? t("exportWizard.installing") : t("exportWizard.install")}
        </Button>
      </div>
    </div>
  );
}
