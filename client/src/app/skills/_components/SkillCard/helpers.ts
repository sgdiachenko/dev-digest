import type { SkillStats } from "@devdigest/shared";

/** How the footer shows the accept figure: nothing decided yet, a grey small sample, or a coloured rate. */
export type FooterAccept = { kind: "none" } | { kind: "smallSample" } | { kind: "rate"; rate: number };

export interface FooterParts {
  agents: number;
  /** Whole percent, null = no skill data (shown as "— pull", never 0%). */
  pullPct: number | null;
  accept: FooterAccept;
  /** Behind the hover/focus hint: "m of n runs · x of y decided". */
  breakdown: { pulled: number; total: number; accepted: number; decided: number };
}

/** Pure view model of the rail-card footer, from the card's own `stats` (the one `GET /skills` response). */
export function footerParts(stats: SkillStats): FooterParts {
  let accept: FooterAccept = { kind: "none" };
  if (stats.accept_pct != null && stats.accept_rate != null) {
    accept = stats.small_sample ? { kind: "smallSample" } : { kind: "rate", rate: stats.accept_rate };
  }
  return {
    agents: stats.agent_count,
    pullPct: stats.pull_pct,
    accept,
    breakdown: {
      pulled: stats.pull_runs,
      total: stats.pull_runs_total,
      accepted: stats.accepted,
      decided: stats.accepted + stats.dismissed,
    },
  };
}
