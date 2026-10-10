import { describe, it, expect } from "vitest";
import type { PrMeta } from "@devdigest/shared";
import { agentAccent, estimateOf, estimateTotals, formatCost, formatSeconds, preselectPr, startBlockReason } from "./helpers";

const est = (agent_id: string, avg_duration_ms: number | null, avg_cost_usd: number | null, runs = 3) => ({
  agent_id,
  runs,
  avg_duration_ms,
  avg_cost_usd,
});

describe("estimateTotals", () => {
  it("takes the max duration and the summed cost, leaving agents without data out", () => {
    const estimates = [est("a", 6000, 0.01), est("b", 12000, 0.02), est("c", null, null, 0)];
    expect(estimateTotals(estimates, ["a", "b", "c", "d"])).toEqual({
      durationMs: 12000,
      costUsd: 0.03,
      withoutData: 2,
    });
    expect(estimateTotals(estimates, ["c"])).toEqual({ durationMs: null, costUsd: null, withoutData: 1 });
    expect(estimateOf(estimates, "c")).toBeNull();
  });
});

describe("startBlockReason", () => {
  const base = { checked: 2, prSelected: true, loading: false, runningGroup: false };
  it("orders the reasons and allows a run with 2+ agents", () => {
    expect(startBlockReason(base)).toBeNull();
    expect(startBlockReason({ ...base, loading: true })).toBe("loading");
    expect(startBlockReason({ ...base, prSelected: false })).toBe("no_pr");
    expect(startBlockReason({ ...base, runningGroup: true })).toBe("running");
    expect(startBlockReason({ ...base, checked: 0 })).toBe("none");
    expect(startBlockReason({ ...base, checked: 1 })).toBe("single");
  });
});

describe("preselectPr", () => {
  const pulls = [{ id: "pr482", number: 482 }, { id: "pr1", number: 1 }] as PrMeta[];
  it("selects an existing PR number and ignores everything else", () => {
    expect(preselectPr("482", pulls)?.id).toBe("pr482");
    expect(preselectPr("999", pulls)).toBeNull();
    expect(preselectPr("4x2", pulls)).toBeNull();
    expect(preselectPr(null, pulls)).toBeNull();
    expect(preselectPr("482", undefined)).toBeNull();
  });
});

describe("formatters", () => {
  it("formats seconds and cost", () => {
    expect(formatSeconds(6000)).toBe("6s");
    expect(formatSeconds(65000)).toBe("1m 5s");
    expect(formatSeconds(null)).toBe("—");
    expect(formatCost(0.0143)).toBe("$0.014");
    expect(formatCost(null)).toBe("—");
    expect(formatCost(0.0123)).toBe("$0.012");
    expect(formatCost(1e-7)).toMatch(/^\$0\.0000001/);
    expect(formatCost(1e-7)).not.toMatch(/e/i);
  });
});

describe("agentAccent", () => {
  it.each([
    ["Security Auditor", "Shield", "var(--crit)"],
    ["PERFORMANCE", "Zap", "var(--warn)"],
    ["Junior Dev", "Lightbulb", "var(--accent)"],
    ["Mentor", "Lightbulb", "var(--accent)"],
    ["Customer Advocate", "Users", "#a855f7"],
    ["Architecture", "Workflow", "var(--ok)"],
    ["Style", "Cpu", "var(--text-muted)"],
  ])("%s -> %s", (name, icon, color) => {
    expect(agentAccent(name)).toEqual({ icon, color });
  });
});
