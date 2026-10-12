import type { CiRunStatus, CiUnavailableReason, Verdict } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Status presentation — text plus icon, never colour alone (C10). */
export const RUN_STATUS_VIEW: Record<CiRunStatus, { icon: IconName; color: string; bg: string; labelKey: string }> = {
  succeeded: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)", labelKey: "runs.status.succeeded" },
  no_findings: { icon: "Check", color: "var(--text-secondary)", bg: "var(--bg-hover)", labelKey: "runs.status.noFindings" },
  failed: { icon: "XCircle", color: "var(--crit)", bg: "var(--crit-bg)", labelKey: "runs.status.failed" },
  running: { icon: "RefreshCw", color: "var(--accent)", bg: "var(--bg-hover)", labelKey: "runs.status.running" },
  skipped: { icon: "Slash", color: "var(--text-secondary)", bg: "var(--bg-hover)", labelKey: "runs.status.skipped" },
  cancelled: { icon: "X", color: "var(--text-secondary)", bg: "var(--bg-hover)", labelKey: "runs.status.cancelled" },
};

export const VERDICT_KEYS: Record<Verdict, string> = {
  approve: "runs.verdict.approve",
  comment: "runs.verdict.comment",
  request_changes: "runs.verdict.request_changes",
};

export const REASON_KEYS: Record<CiUnavailableReason, string> = {
  artifact_expired: "runs.reason.artifact_expired",
  artifact_missing: "runs.reason.artifact_missing",
  artifact_invalid: "runs.reason.artifact_invalid",
  artifact_too_large: "runs.reason.artifact_too_large",
};
