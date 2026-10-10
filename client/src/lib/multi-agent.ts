/* multi-agent.ts — pure logic shared by the multi-agent configure page and
   the PR page's Run Review popover. */
import type { AgentRunEstimate } from "@devdigest/shared";

/** An agent's estimate, or null when it has no done runs to average ("no data"). */
export function estimateOf(
  estimates: AgentRunEstimate[] | undefined,
  agentId: string,
): AgentRunEstimate | null {
  const e = estimates?.find((x) => x.agent_id === agentId);
  return e && e.runs > 0 && e.avg_duration_ms != null ? e : null;
}

export type StartBlockReason = "loading" | "no_pr" | "running" | "none" | "single";

/** Why the start button is disabled, or null when the run may start. */
export function startBlockReason(input: {
  checked: number;
  prSelected: boolean;
  loading: boolean;
  runningGroup: boolean;
}): StartBlockReason | null {
  if (input.loading) return "loading";
  if (!input.prSelected) return "no_pr";
  if (input.runningGroup) return "running";
  if (input.checked === 0) return "none";
  if (input.checked === 1) return "single";
  return null;
}
