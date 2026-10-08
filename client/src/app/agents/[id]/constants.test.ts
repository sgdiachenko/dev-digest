import { describe, it, expect } from "vitest";
import { TABS } from "./_components/AgentEditor/constants";
import { VALID_TABS } from "./constants";

describe("agent editor tabs", () => {
  it("accepts every editor tab in ?tab= and keeps Evals right after Context (AC-59)", () => {
    for (const tab of TABS) expect(VALID_TABS).toContain(tab.key);
    const keys = TABS.map((tab) => tab.key);
    expect(keys[keys.indexOf("context") + 1]).toBe("evals");
  });
});
