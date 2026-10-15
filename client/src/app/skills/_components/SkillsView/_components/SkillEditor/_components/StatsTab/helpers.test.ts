import { describe, it, expect } from "vitest";
import { ApiError } from "../../../../../../../../lib/api";
import { skillTabState } from "./helpers";
import { makeStats } from "./testing";

const ok = { isError: false, error: null };
const empty = { agent_count: 0, agents: [], skill_runs: 0, pull_runs: 0, pull_runs_total: 0 };

describe("skillTabState", () => {
  it("is pending until the first read answers, and error when it failed with no figures", () => {
    expect(skillTabState(ok, undefined)).toBe("pending");
    expect(skillTabState({ isError: true, error: new ApiError("boom", 500) }, undefined)).toBe("error");
    expect(skillTabState({ isError: true, error: new Error("net") }, undefined)).toBe("error");
  });

  it("maps 422 and 404 to their own states, even with cached figures", () => {
    expect(skillTabState({ isError: true, error: new ApiError("bad", 422) }, undefined)).toBe("invalid");
    expect(skillTabState({ isError: true, error: new ApiError("bad", 422) }, makeStats())).toBe("invalid");
    expect(skillTabState({ isError: true, error: new ApiError("gone", 404) }, undefined)).toBe("notFound");
    expect(skillTabState({ isError: true, error: new ApiError("gone", 404) }, makeStats())).toBe("notFound");
  });

  it("keeps the figures when a refresh failed (a 5xx with figures in hand)", () => {
    expect(skillTabState({ isError: true, error: new ApiError("boom", 500) }, makeStats())).toBe("figures");
  });

  it("noUsage: nothing linked and no skill run (AC-33)", () => {
    expect(skillTabState(ok, makeStats(empty))).toBe("noUsage");
  });

  it("noRuns: agents linked, no skill run and an empty pull base (AC-34); a non-empty pull base shows figures", () => {
    expect(skillTabState(ok, makeStats({ ...empty, agent_count: 2 }))).toBe("noRuns");
    expect(skillTabState(ok, makeStats({ ...empty, agent_count: 2, pull_runs_total: 3 }))).toBe("figures");
  });

  it("figures: unlinked agents' skill runs still show figures (EC-2)", () => {
    expect(skillTabState(ok, makeStats({ agent_count: 0, agents: [], skill_runs: 4 }))).toBe("figures");
  });
});
