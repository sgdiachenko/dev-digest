import type { SkillStats } from "@devdigest/shared";

/** Footer counters for the rail card: agent count always, pull/accept only when
 *  there's real data behind them — `—` beats a misleading `0%`. */
export interface FooterSegment {
  key: "agents" | "pull" | "accept";
  label: string;
}

export function footerSegments(stats: SkillStats): FooterSegment[] {
  const segments: FooterSegment[] = [{ key: "agents", label: `${stats.agent_count} agents` }];
  segments.push({ key: "pull", label: stats.pull_pct == null ? "— pull" : `${stats.pull_pct}% pull` });
  segments.push({ key: "accept", label: stats.accept_pct == null ? "— accept" : `${stats.accept_pct}% accept` });
  return segments;
}
