import type {
  AgentColumn,
  AgentColumnFinding,
  Conflict,
  FindingGroup,
  FindingRecord,
  ReviewRecord,
} from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

export type ResultsView = "columns" | "tabs";
export type ColumnStatus = AgentColumn["status"];
export type AgreementState = "list" | "allAgree" | "noFindings";

/** Only the two known views are accepted from the URL; anything else is `columns`. */
export function parseView(param: string | null | undefined): ResultsView {
  return param === "tabs" ? "tabs" : "columns";
}

/** The selected agent tab: a member `run_id`, else the first column (null when none). */
export function resolveAgentTab(param: string | null | undefined, columns: AgentColumn[]): string | null {
  const match = columns.find((c) => c.run_id === param);
  return (match ?? columns[0])?.run_id ?? null;
}

/** The column behind `?trace=`; only member runs of the group are accepted. */
export function resolveTraceRun(param: string | null | undefined, columns: AgentColumn[]): AgentColumn | null {
  return columns.find((c) => c.run_id === param) ?? null;
}

/** Agent name, or "Deleted agent" when the agent no longer exists. */
export function agentLabel(col: Pick<AgentColumn, "agent_id" | "agent_name">, t: (key: string) => string): string {
  return col.agent_id === null || !col.agent_name ? t("deletedAgent") : col.agent_name;
}

export function visibleConflicts(conflicts: Conflict[], onlyConflicts: boolean): Conflict[] {
  return onlyConflicts ? conflicts.filter((c) => c.is_conflict) : conflicts;
}

/** No groups at all → `noFindings`; the conflicts-only filter leaving none → `allAgree`. */
export function agreementState(conflicts: Conflict[], onlyConflicts: boolean): AgreementState {
  if (conflicts.length === 0) return "noFindings";
  return visibleConflicts(conflicts, onlyConflicts).length === 0 ? "allAgree" : "list";
}

export function allMembersFailed(columns: AgentColumn[]): boolean {
  return columns.length > 0 && columns.every((c) => c.status === "failed");
}

/** Persisted findings of one member run (the review rows carry the `run_id`). */
export function findingsForRun(reviews: ReviewRecord[] | undefined, runId: string | null): FindingRecord[] {
  if (!runId) return [];
  return (reviews ?? []).filter((r) => r.run_id === runId).flatMap((r) => r.findings);
}

export const STATUS_META: Record<ColumnStatus, { icon: IconName; key: ColumnStatus }> = {
  running: { icon: "RefreshCw", key: "running" },
  done: { icon: "CheckCircle", key: "done" },
  failed: { icon: "XCircle", key: "failed" },
  cancelled: { icon: "Slash", key: "cancelled" },
};

/** Icon and message key for a column status (status is never colour alone). */
export function statusMeta(status: ColumnStatus) {
  return STATUS_META[status];
}

export interface GroupMember {
  column: AgentColumn;
  finding: AgentColumnFinding;
}

/** The findings a group points to, with the column (agent) each came from. */
export function groupMembers(group: FindingGroup, columns: AgentColumn[]): GroupMember[] {
  const out: GroupMember[] = [];
  for (const id of group.finding_ids) {
    for (const column of columns) {
      const finding = column.findings.find((f) => f.id === id);
      if (finding) out.push({ column, finding });
    }
  }
  return out;
}

/** Line range as shown next to a file path ("12" or "12-18"). */
export function lineRange(start: number, end: number | null): string {
  return end == null || end === start ? String(start) : `${start}-${end}`;
}

export const SEVERITY_META: Record<"CRITICAL" | "WARNING" | "SUGGESTION", { icon: IconName; color: string }> = {
  CRITICAL: { icon: "AlertOctagon", color: "var(--crit)" },
  WARNING: { icon: "AlertTriangle", color: "var(--warn)" },
  SUGGESTION: { icon: "Info", color: "var(--accent)" },
};

/** Icon and colour of a finding's severity (unknown values fall back to SUGGESTION). */
export function severityMeta(severity: string) {
  return SEVERITY_META[severity as keyof typeof SEVERITY_META] ?? SEVERITY_META.SUGGESTION;
}

/** Fraction (0..1) of the score ring to fill; null/NaN → 0, clamped to 0..100. */
export function scoreFraction(score: number | null | undefined): number {
  if (score == null || Number.isNaN(score)) return 0;
  return Math.min(100, Math.max(0, score)) / 100;
}

const CATEGORY_ICONS: Record<string, IconName> = {
  security: "Shield",
  bug: "Bug",
  perf: "Zap",
  style: "Code",
  test: "FlaskConical",
};

/** Icon of a finding category (unknown values fall back to a neutral tag). */
export function categoryIcon(category: string): IconName {
  return CATEGORY_ICONS[category] ?? "Tag";
}

/** Rounded percentage and dot colour of a 0..1 confidence (same bands as the finding card). */
export function confidenceMeta(value: number): { pct: number; color: string } {
  const pct = Math.round((Number.isNaN(value) ? 0 : value) * 100);
  const color = pct >= 85 ? "var(--ok)" : pct >= 65 ? "var(--warn)" : "var(--text-muted)";
  return { pct, color };
}

/** Colour of a 0..100 score number: low is critical, middle is a warning, high is ok. */
export function scoreColor(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "var(--text-muted)";
  if (score < 50) return "var(--crit)";
  return score < 70 ? "var(--warn)" : "var(--ok)";
}
