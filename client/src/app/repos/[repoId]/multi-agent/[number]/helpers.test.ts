import { describe, it, expect } from "vitest";
import type { AgentColumn, Conflict, ReviewRecord } from "@devdigest/shared";
import {
  agentLabel,
  categoryIcon,
  confidenceMeta,
  scoreColor,
  agreementState,
  allMembersFailed,
  findingsForRun,
  groupMembers,
  lineRange,
  parseView,
  resolveAgentTab,
  resolveTraceRun,
  statusMeta,
  visibleConflicts,
} from "./helpers";

const col = (run_id: string, over: Partial<AgentColumn> = {}): AgentColumn => ({
  run_id,
  agent_id: `a-${run_id}`,
  agent_name: `Agent ${run_id}`,
  provider: null,
  model: null,
  status: "done",
  error: null,
  verdict: null,
  score: null,
  summary: null,
  duration_ms: null,
  cost_usd: null,
  findings: [],
  ...over,
});
const conflict = (group_id: string, is_conflict: boolean): Conflict => ({
  group_id,
  file: "a.ts",
  line: 1,
  end_line: 1,
  title: "t",
  is_conflict,
  takes: [],
});
const t = (k: string) => (k === "deletedAgent" ? "Deleted agent" : k);

describe("results helpers", () => {
  it("falls back to defaults for an invalid view, agent or trace", () => {
    const cols = [col("r1"), col("r2")];
    expect(parseView("tabs")).toBe("tabs");
    expect(parseView("grid")).toBe("columns");
    expect(parseView(null)).toBe("columns");
    expect(resolveAgentTab("r2", cols)).toBe("r2");
    expect(resolveAgentTab("zzz", cols)).toBe("r1");
    expect(resolveAgentTab("r1", [])).toBeNull();
    expect(resolveTraceRun("r2", cols)?.run_id).toBe("r2");
    expect(resolveTraceRun("zzz", cols)).toBeNull();
    expect(resolveTraceRun(null, cols)).toBeNull();
  });

  it("labels a deleted agent", () => {
    expect(agentLabel(col("r1"), t)).toBe("Agent r1");
    expect(agentLabel(col("r1", { agent_id: null, agent_name: null }), t)).toBe("Deleted agent");
  });

  it("derives the agreement state and the visible conflicts", () => {
    const mixed = [conflict("g1", true), conflict("g2", false)];
    const agree = [conflict("g1", false)];
    expect(agreementState([], false)).toBe("noFindings");
    expect(agreementState([], true)).toBe("noFindings");
    expect(agreementState(mixed, true)).toBe("list");
    expect(agreementState(agree, true)).toBe("allAgree");
    expect(agreementState(agree, false)).toBe("list");
    expect(visibleConflicts(mixed, true).map((c) => c.group_id)).toEqual(["g1"]);
    expect(visibleConflicts(mixed, false)).toHaveLength(2);
  });

  it("detects a group where every member failed", () => {
    expect(allMembersFailed([col("r1", { status: "failed" }), col("r2", { status: "failed" })])).toBe(true);
    expect(allMembersFailed([col("r1", { status: "failed" }), col("r2")])).toBe(false);
    expect(allMembersFailed([])).toBe(false);
  });

  it("filters findings by run_id", () => {
    const f = (id: string) => ({ id }) as ReviewRecord["findings"][number];
    const reviews = [
      { run_id: "r1", findings: [f("f1")] },
      { run_id: "r2", findings: [f("f2"), f("f3")] },
      { run_id: null, findings: [f("f4")] },
    ] as ReviewRecord[];
    expect(findingsForRun(reviews, "r2").map((x) => x.id)).toEqual(["f2", "f3"]);
    expect(findingsForRun(reviews, null)).toEqual([]);
    expect(findingsForRun(undefined, "r1")).toEqual([]);
  });

  it("maps statuses to an icon and message key, and group findings to columns", () => {
    expect(statusMeta("failed")).toEqual({ icon: "XCircle", key: "failed" });
    const finding = { id: "f1", severity: "WARNING", category: "bug", title: "x", file: "a.ts", start_line: 1, end_line: 1 } as const;
    const cols = [col("r1", { findings: [finding] }), col("r2")];
    const members = groupMembers(
      { id: "f1", file: "a.ts", start_line: 1, end_line: 1, finding_ids: ["f1", "nope"], run_ids: ["r1"] },
      cols,
    );
    expect(members.map((m) => m.column.run_id)).toEqual(["r1"]);
    expect(lineRange(3, 3)).toBe("3");
    expect(lineRange(3, null)).toBe("3");
    expect(lineRange(3, 9)).toBe("3-9");
  });
});

describe("severityMeta / scoreFraction", () => {
  it("maps severities to icon + colour, falling back to SUGGESTION", async () => {
    const { severityMeta, scoreFraction } = await import("./helpers");
    expect(severityMeta("CRITICAL").icon).toBe("AlertOctagon");
    expect(severityMeta("WARNING").icon).toBe("AlertTriangle");
    expect(severityMeta("weird")).toEqual(severityMeta("SUGGESTION"));
    expect(scoreFraction(null)).toBe(0);
    expect(scoreFraction(150)).toBe(1);
    expect(scoreFraction(40)).toBe(0.4);
  });
});

describe("tabs view helpers", () => {
  it("maps categories to icons with a neutral fallback", () => {
    expect(categoryIcon("security")).toBe("Shield");
    expect(categoryIcon("bug")).toBe("Bug");
    expect(categoryIcon("whatever")).toBe("Tag");
  });

  it("derives the confidence percentage and dot colour", () => {
    expect(confidenceMeta(0.98)).toEqual({ pct: 98, color: "var(--ok)" });
    expect(confidenceMeta(0.79)).toEqual({ pct: 79, color: "var(--warn)" });
    expect(confidenceMeta(0.3)).toEqual({ pct: 30, color: "var(--text-muted)" });
  });

  it("colours the score by band", () => {
    expect(scoreColor(38)).toBe("var(--crit)");
    expect(scoreColor(64)).toBe("var(--warn)");
    expect(scoreColor(72)).toBe("var(--ok)");
    expect(scoreColor(null)).toBe("var(--text-muted)");
  });
});
