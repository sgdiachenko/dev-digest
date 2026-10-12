import type { AgentRunEstimate, PrMeta } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import { estimateOf } from "@/lib/multi-agent";

// Shared with the PR page's popover, so they live in lib/.
export { formatCost, formatSeconds } from "@/lib/format";
export { estimateOf, startBlockReason, type StartBlockReason } from "@/lib/multi-agent";

export interface EstimateTotals {
  /** Slowest checked agent (they run in parallel); null when none has data. */
  durationMs: number | null;
  /** Sum of the checked agents' average costs; null when none has data. */
  costUsd: number | null;
  /** Checked agents that have no estimate and are left out of the totals. */
  withoutData: number;
}

export function estimateTotals(
  estimates: AgentRunEstimate[] | undefined,
  checkedIds: string[],
): EstimateTotals {
  let durationMs: number | null = null;
  let costUsd: number | null = null;
  let withoutData = 0;
  for (const id of checkedIds) {
    const e = estimateOf(estimates, id);
    if (!e) {
      withoutData += 1;
      continue;
    }
    durationMs = Math.max(durationMs ?? 0, e.avg_duration_ms ?? 0);
    if (e.avg_cost_usd != null) costUsd = (costUsd ?? 0) + e.avg_cost_usd;
  }
  return { durationMs, costUsd, withoutData };
}

/** `?pr=<number>` → that pull, only for a plain integer that exists in the list. */
export function preselectPr(param: string | null | undefined, pulls: PrMeta[] | undefined): PrMeta | null {
  if (!param || !/^\d{1,9}$/.test(param)) return null;
  return pulls?.find((p) => p.number === Number(param) && p.id) ?? null;
}

export interface AgentAccent {
  /** CSS colour (theme variable where one exists) used for border, tint and icon. */
  color: string;
  icon: IconName;
}

// First match wins; order matters ("junior security" is a security agent).
const ACCENTS: { match: string[]; accent: AgentAccent }[] = [
  { match: ["security"], accent: { color: "var(--crit)", icon: "Shield" } },
  { match: ["performance"], accent: { color: "var(--warn)", icon: "Zap" } },
  { match: ["junior", "mentor"], accent: { color: "var(--accent)", icon: "Lightbulb" } },
  { match: ["customer"], accent: { color: "#a855f7", icon: "Users" } },
  // The icon set has no Network glyph; Workflow is the nearest.
  { match: ["architecture"], accent: { color: "var(--ok)", icon: "Workflow" } },
];
const NEUTRAL_ACCENT: AgentAccent = { color: "var(--text-muted)", icon: "Cpu" };

/** Accent colour + icon for an agent, picked by case-insensitive name substring. */
export function agentAccent(name: string): AgentAccent {
  const n = name.toLowerCase();
  return ACCENTS.find((a) => a.match.some((m) => n.includes(m)))?.accent ?? NEUTRAL_ACCENT;
}
