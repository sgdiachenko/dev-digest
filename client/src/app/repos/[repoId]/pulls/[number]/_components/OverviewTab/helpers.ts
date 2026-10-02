import type { ReviewRecord, RiskSeverity, Settings } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import { FEATURE_MODELS } from "@/lib/feature-models";

/** Shortens `path` to at most `max` characters by cutting the middle with "…",
    keeping the head and (more of) the tail — the file name is the useful end. */
export function middleTruncate(path: string, max = 48): string {
  if (path.length <= max) return path;
  const keep = Math.max(max - 1, 2);
  const tail = Math.ceil(keep * 0.6);
  const head = keep - tail;
  return `${path.slice(0, head)}…${path.slice(path.length - tail)}`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** `$0.0123` for sub-cent costs, `$1.23` otherwise; `null` (not reported) is
    NOT zero — it renders the caller-supplied "cost not reported" text. */
export function formatBriefCost(cost: number | null | undefined, notReported: string): string {
  if (cost == null) return notReported;
  return `$${cost.toFixed(cost > 0 && cost < 0.01 ? 4 : 2)}`;
}

const UNITS: { key: "days" | "hours" | "minutes"; ms: number }[] = [
  { key: "days", ms: 86_400_000 },
  { key: "hours", ms: 3_600_000 },
  { key: "minutes", ms: 60_000 },
];

export type RelativeTimeParts = { key: "justNow" } | { key: "days" | "hours" | "minutes"; count: number };

/** Age of `iso` as a message key + count (formatted by the component through
    the `brief.card.relativeTime.*` catalog entries). Future times read "just now". */
export function relativeTime(iso: string, now: number = Date.now()): RelativeTimeParts {
  const age = now - new Date(iso).getTime();
  for (const { key, ms } of UNITS) {
    if (age >= ms) return { key, count: Math.floor(age / ms) };
  }
  return { key: "justNow" };
}

/** The model that a generate click would use: the workspace override for the
    `risk_brief` feature, else the built-in default. */
export function riskModelLabel(settings: Settings | null | undefined): string {
  const choice = settings?.feature_models?.risk_brief;
  if (choice) return choice.model;
  return FEATURE_MODELS.find((f) => f.id === "risk_brief")?.defaultModel ?? "";
}

/** The newest `kind: "review"` record (by `created_at`), or null. */
export function latestReview(reviews: ReviewRecord[] | null | undefined): ReviewRecord | null {
  let best: ReviewRecord | null = null;
  for (const r of reviews ?? []) {
    if (r.kind !== "review") continue;
    if (!best || r.created_at > best.created_at) best = r;
  }
  return best;
}

/** Where the "Generated without" entry for `input` can be fixed in the studio. */
export function missingFixHref(input: string, repoId: string): string | null {
  if (input === "intent") return "#intent";
  if (input === "specs") return `/repos/${repoId}/context`;
  return null;
}

/** A risk `file_ref`: `path`, `path:12` or `path:12-20` (line = range start). */
export function parseFileRef(ref: string): { path: string; line: number | null } {
  const m = /^(.*?):(\d+)(?:-(\d+))?$/.exec(ref);
  if (!m) return { path: ref, line: null };
  const line = Number(m[2]);
  return { path: m[1] ?? ref, line: line >= 1 ? line : null };
}

export const SEVERITY_META: Record<RiskSeverity, { icon: IconName; color: string; bg: string }> = {
  high: { icon: "AlertOctagon", color: "var(--crit)", bg: "var(--crit-bg)" },
  medium: { icon: "AlertTriangle", color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { icon: "Info", color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};
