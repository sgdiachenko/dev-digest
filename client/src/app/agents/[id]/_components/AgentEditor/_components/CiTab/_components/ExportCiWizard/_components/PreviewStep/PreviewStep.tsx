/* PreviewStep — the bundle's file list; only the workflow is editable, every other file is read-only
   (AC-11–AC-13, AC-127, AC-146, AC-149, EC-17). Loading and error states carry their own Retry. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { CI_LIMITS, CI_PATHS, type CiFile } from "@devdigest/shared";
import type { BundleError } from "../../useBundlePreview";
import { workflowEditProblem } from "../../helpers";
import { step } from "../stepStyles";
import { s } from "./styles";

const KNOWN_ERRORS: Record<string, string> = { runner_bundle_unavailable: "exportWizard.errors.runnerBundleUnavailable" };

export function PreviewStep({
  files,
  loading,
  error,
  onRetry,
  workflowEdit,
  onEdit,
}: {
  files: CiFile[] | null;
  loading: boolean;
  error: BundleError | null;
  onRetry: () => void;
  workflowEdit: string | null;
  onEdit: (next: string) => void;
}) {
  const t = useTranslations("ci");
  const [selected, setSelected] = React.useState<string>(CI_PATHS.WORKFLOW);

  if (loading) {
    return (
      <div style={step.body} aria-busy="true" aria-label={t("exportWizard.generating")}>
        <Skeleton height={20} width={220} />
        <Skeleton height={180} />
      </div>
    );
  }
  if (error) {
    const known = error.code ? KNOWN_ERRORS[error.code] : undefined;
    return (
      <ErrorState title={t("exportWizard.previewFailed")} body={known ? t(known) : error.message} onRetry={onRetry} />
    );
  }
  if (!files) return null;

  const current = files.find((f) => f.path === selected) ?? files[0]!;
  const isWorkflow = current.path === CI_PATHS.WORKFLOW;
  const text = isWorkflow && workflowEdit !== null ? workflowEdit : current.contents;
  const problem = workflowEditProblem(workflowEdit);

  return (
    <div style={step.body}>
      <div style={step.label}>{t("exportWizard.filesToCreate")}</div>
      <div style={s.layout}>
        <ul style={s.list} aria-label={t("exportWizard.filesToCreate")}>
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                aria-pressed={f.path === current.path}
                onClick={() => setSelected(f.path)}
                style={{ ...s.file, ...(f.path === current.path ? s.fileOn : null) }}
                title={f.path}
              >
                <span className="mono" style={s.path}>
                  {f.path}
                </span>
                <span style={s.tag}>
                  {f.path === CI_PATHS.WORKFLOW ? t("exportWizard.editable") : t("exportWizard.readOnly")}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div style={s.viewer}>
          {isWorkflow ? (
            <textarea
              aria-label={t("exportWizard.editWorkflow", { path: current.path })}
              value={text}
              spellCheck={false}
              onChange={(e) => onEdit(e.target.value)}
              style={s.editor}
            />
          ) : (
            <pre tabIndex={0} aria-label={t("exportWizard.readOnlyFile", { path: current.path })} style={s.readOnly}>
              {text}
            </pre>
          )}
          <div role="alert" style={step.error}>
            {problem === "too_large"
              ? t("exportWizard.workflowTooLarge", { max: CI_LIMITS.WORKFLOW_EDIT_MAX_BYTES / 1024 })
              : problem === "empty"
                ? t("exportWizard.workflowEmpty")
                : null}
          </div>
        </div>
      </div>
    </div>
  );
}
