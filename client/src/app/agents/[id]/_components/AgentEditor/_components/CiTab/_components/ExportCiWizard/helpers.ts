import { strToU8, zipSync } from "fflate";
import { CI_LIMITS, CI_PATHS, type CiFile, type CiTrigger } from "@devdigest/shared";
import type { PostAs } from "./constants";

export interface WizardConfig {
  repo: string;
  triggers: CiTrigger[];
  postAs: PostAs;
}

/** Identity of the inputs the bundle is generated from; a different key means a different bundle. */
export function configKey(cfg: WizardConfig): string {
  return JSON.stringify([cfg.repo, [...cfg.triggers].sort(), cfg.postAs]);
}

export function utf8Length(text: string): number {
  return strToU8(text).length;
}

/** AC-36 mirrored client-side as a hint: the workflow edit must be non-empty and within the server cap. */
export function workflowEditProblem(edit: string | null): "empty" | "too_large" | null {
  if (edit === null) return null;
  if (edit.trim() === "") return "empty";
  return utf8Length(edit) > CI_LIMITS.WORKFLOW_EDIT_MAX_BYTES ? "too_large" : null;
}

/** The Preview files with the user's workflow edit applied — exactly what the zip holds (AC-18). */
export function effectiveFiles(files: CiFile[], workflowEdit: string | null): CiFile[] {
  if (workflowEdit === null) return files;
  return files.map((f) => (f.path === CI_PATHS.WORKFLOW ? { ...f, contents: workflowEdit } : f));
}

export function buildZip(files: CiFile[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((f) => [f.path, strToU8(f.contents)])));
}
