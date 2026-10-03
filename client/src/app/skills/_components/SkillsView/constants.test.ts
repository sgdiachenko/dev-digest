import { describe, it, expect } from "vitest";
import { DEFAULT_TAB, VALID_TABS } from "./constants";
import { TABS } from "./_components/SkillEditor/constants";

describe("skill editor tabs", () => {
  it("every editor tab is reachable through ?tab= (VALID_TABS accepts it)", () => {
    // A tab missing from VALID_TABS silently falls back to Config, so its `?tab=` link
    // (for example "Used by" → /skills/:id?tab=context) would open the wrong tab.
    for (const tab of TABS) expect(VALID_TABS as readonly string[]).toContain(tab.key);
  });

  it("keeps Config as the default and Context second", () => {
    expect(DEFAULT_TAB).toBe("config");
    expect(TABS[1]?.key).toBe("context");
  });
});
