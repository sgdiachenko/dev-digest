import { describe, it, expect } from "vitest";
import { agentHref } from "./helpers";

describe("agentHref", () => {
  it("keeps tab, range, from and to when switching agents (AC-164, EC-46)", () => {
    expect(agentHref("b", "?tab=stats&range=30d&from=X&to=Y")).toBe("/agents/b?tab=stats&range=30d&from=X&to=Y");
  });

  it("drops an open run trace: it belongs to the agent being left", () => {
    expect(agentHref("b", "?tab=stats&trace=run-1&range=30d")).toBe("/agents/b?tab=stats&range=30d");
    expect(agentHref("b", "trace=run-1")).toBe("/agents/b");
  });

  it("accepts a query without the leading ? and a missing query", () => {
    expect(agentHref("b", "tab=config")).toBe("/agents/b?tab=config");
    expect(agentHref("b", "")).toBe("/agents/b");
  });

  it("builds the path from the id only", () => {
    expect(agentHref("a/../x", "?tab=stats")).toBe("/agents/a%2F..%2Fx?tab=stats");
  });
});
