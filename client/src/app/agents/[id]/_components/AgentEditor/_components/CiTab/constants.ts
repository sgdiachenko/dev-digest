import type { CiFailOn, CiRunStatus } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** "Fail CI on" options (AC-71). `any` is deliberately absent: it is set on the Config tab (AC-74). */
export const FAIL_ON_OPTIONS: readonly { value: CiFailOn; labelKey: string }[] = [
  { value: "critical", labelKey: "ciTab.failOn.critical" },
  { value: "warning", labelKey: "ciTab.failOn.warning" },
  { value: "never", labelKey: "ciTab.failOn.never" },
];

/** Error codes whose fix is a token change in Settings (AC-22, AC-102). */
export const SETTINGS_ERROR_CODES: readonly string[] = ["github_token_missing", "github_scope_missing"];

/** Latest-run status presentation — text plus icon, never colour alone (C10). */
export const RUN_STATUS_VIEW: Record<
  CiRunStatus,
  { icon: IconName; color: string; bg: string; labelKey: string }
> = {
  succeeded: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)", labelKey: "runs.status.succeeded" },
  no_findings: { icon: "Check", color: "var(--text-secondary)", bg: "var(--bg-hover)", labelKey: "runs.status.noFindings" },
  failed: { icon: "XCircle", color: "var(--crit)", bg: "var(--crit-bg)", labelKey: "runs.status.failed" },
  running: { icon: "RefreshCw", color: "var(--accent)", bg: "var(--bg-hover)", labelKey: "runs.status.running" },
  skipped: { icon: "Slash", color: "var(--text-secondary)", bg: "var(--bg-hover)", labelKey: "runs.status.skipped" },
  cancelled: { icon: "X", color: "var(--text-secondary)", bg: "var(--bg-hover)", labelKey: "runs.status.cancelled" },
};
