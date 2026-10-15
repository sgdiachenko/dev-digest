import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { perfOf } from "../../testing";
import { dashboardState, isInvalidPeriod } from "./helpers";

describe("isInvalidPeriod", () => {
  it("is true only for a 422 ApiError", () => {
    expect(isInvalidPeriod(new ApiError("bad", 422))).toBe(true);
    expect(isInvalidPeriod(new ApiError("boom", 500))).toBe(false);
    expect(isInvalidPeriod(new Error("x"))).toBe(false);
    expect(isInvalidPeriod(undefined)).toBe(false);
  });
});

describe("dashboardState", () => {
  it("is invalid on a 422, even when older data is still shown", () => {
    expect(dashboardState({ shown: perfOf(), error: new ApiError("bad", 422) })).toBe("invalid");
  });

  it("is pending with nothing to show and no error", () => {
    expect(dashboardState({ shown: undefined, error: null })).toBe("pending");
  });

  it("is error with nothing to show and a failed load", () => {
    expect(dashboardState({ shown: undefined, error: new ApiError("boom", 500) })).toBe("error");
  });

  it("keeps the figures when a refresh fails but data is shown", () => {
    expect(dashboardState({ shown: perfOf(), error: new ApiError("boom", 500) })).toBe("data");
  });

  it("is noAgents when the workspace has no agents", () => {
    expect(dashboardState({ shown: perfOf({}, { agent_count: 0 }), error: null })).toBe("noAgents");
  });

  it("is noReviews when no agent has ever run", () => {
    expect(dashboardState({ shown: perfOf({}, { workspace_last_run_at: null }), error: null })).toBe("noReviews");
  });

  it("is noRuns when the period has no runs", () => {
    expect(dashboardState({ shown: perfOf({}, { runs: 0 }), error: null })).toBe("noRuns");
  });

  it("is data otherwise", () => {
    expect(dashboardState({ shown: perfOf(), error: null })).toBe("data");
  });
});
