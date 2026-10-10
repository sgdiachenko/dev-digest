/* ExportCiWizard — Target → Configure → Preview → Install (AC-1, AC-2, AC-14–AC-16). All choices and the workflow
   edit live here for the life of the wizard; closing discards them and sends nothing (AC-16). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { Agent, CiTrigger } from "@devdigest/shared";
import { useRepos } from "@/lib/hooks/core";
import { useModalFocus } from "@/components/modal-focus";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallDone } from "./_components/InstallDone";
import { InstallStep, type InstallResult } from "./_components/InstallStep";
import { PreviewStep } from "./_components/PreviewStep";
import { TargetStep } from "./_components/TargetStep";
import { ALL_TRIGGERS, STEP_KEYS, type PostAs } from "./constants";
import { configKey, workflowEditProblem, type WizardConfig } from "./helpers";
import { useBundlePreview } from "./useBundlePreview";
import { s } from "./styles";

export function ExportCiWizard({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const t = useTranslations("ci");
  const repos = useRepos().data ?? [];
  const bodyRef = React.useRef<HTMLDivElement>(null);
  useModalFocus(true, onClose, bodyRef);

  const [stepIndex, setStepIndex] = React.useState(0);
  const [repoChoice, setRepoChoice] = React.useState<string | null>(null);
  const [triggers, setTriggers] = React.useState<CiTrigger[]>([...ALL_TRIGGERS]);
  const [postAs, setPostAs] = React.useState<PostAs>("github_review");
  const [workflowEdit, setWorkflowEdit] = React.useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = React.useState(false);
  const [done, setDone] = React.useState<InstallResult | null>(null);
  const preview = useBundlePreview(agent.id);

  const repo = repoChoice ?? repos[0]?.full_name ?? "";
  const config: WizardConfig = { repo, triggers, postAs };
  const step = STEP_KEYS[stepIndex]!;

  const canContinue =
    step === "target"
      ? repo !== "" && agent.provider === "openrouter"
      : step === "configure"
        ? triggers.length > 0
        : step === "preview"
          ? !!preview.bundle && !preview.loading && workflowEditProblem(workflowEdit) === null
          : false;

  const toPreview = () => {
    setConfirmRegenerate(false);
    if (preview.bundle?.key !== configKey(config)) preview.load(config);
    setStepIndex(2);
  };
  const onContinue = () => {
    if (step === "configure") {
      // A changed config regenerates the workflow; ask before it replaces the user's edit (AC-15).
      const stale = preview.bundle !== null && preview.bundle.key !== configKey(config);
      if (stale && workflowEdit !== null) setConfirmRegenerate(true);
      else toPreview();
      return;
    }
    setStepIndex((i) => i + 1);
  };
  const replaceEdit = () => {
    setWorkflowEdit(null);
    toPreview();
  };

  const labels = STEP_KEYS.map((k) => t(`exportWizard.steps.${k}`));
  const footer = done ? (
    <div style={s.footer}>
      <div style={s.spacer}>
        <Button kind="primary" onClick={onClose}>
          {t("exportWizard.close")}
        </Button>
      </div>
    </div>
  ) : (
    <div style={s.footer}>
      {stepIndex > 0 && (
        <Button kind="ghost" onClick={() => { setConfirmRegenerate(false); setStepIndex((i) => i - 1); }}>
          {t("exportWizard.back")}
        </Button>
      )}
      <div style={s.spacer}>
        <Button kind="ghost" onClick={onClose}>
          {t("exportWizard.cancel")}
        </Button>
        {step !== "install" && (
          <Button kind="primary" disabled={!canContinue} onClick={onContinue}>
            {t("exportWizard.continue")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      width={860}
      title={t("exportWizard.title")}
      subtitle={t("exportWizard.subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={footer}
    >
      <div ref={bodyRef}>
        {!done && (
          <div style={s.steps}>
            <ExportWizardSteps step={stepIndex} labels={labels} />
          </div>
        )}
        {done ? (
          <InstallDone result={done} />
        ) : step === "target" ? (
          <TargetStep repos={repos} repo={repo} onRepo={setRepoChoice} provider={agent.provider} />
        ) : step === "configure" ? (
          <ConfigureStep triggers={triggers} onTriggers={setTriggers} postAs={postAs} onPostAs={setPostAs} />
        ) : step === "preview" ? (
          <PreviewStep
            files={preview.bundle?.files ?? null}
            loading={preview.loading}
            error={preview.error}
            onRetry={() => preview.load(config)}
            workflowEdit={workflowEdit}
            onEdit={setWorkflowEdit}
          />
        ) : (
          preview.bundle && (
            <InstallStep
              agentId={agent.id}
              config={config}
              files={preview.bundle.files}
              workflowEdit={workflowEdit}
              onInstalled={setDone}
            />
          )
        )}
        {confirmRegenerate && (
          <div role="alertdialog" aria-label={t("exportWizard.regenerateTitle")} style={s.confirm}>
            <div style={{ marginBottom: 8 }}>{t("exportWizard.regenerateBody")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button kind="primary" size="sm" onClick={replaceEdit}>
                {t("exportWizard.regenerateReplace")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setConfirmRegenerate(false)}>
                {t("exportWizard.regenerateKeep")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
