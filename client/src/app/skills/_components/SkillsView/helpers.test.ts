import { describe, it, expect } from "vitest";
import { skillHref } from "./helpers";

describe("skillHref", () => {
  it("keeps the editor tab and the period when switching skills (skill AC-16, EC-16, EC-17)", () => {
    expect(skillHref("b", "?tab=stats&range=30d&from=X&to=Y")).toBe("/skills/b?tab=stats&range=30d&from=X&to=Y");
    expect(skillHref("b", "tab=stats&range=custom&from=2026-10-01T00%3A00%3A00.000Z&to=Z")).toBe(
      "/skills/b?tab=stats&range=custom&from=2026-10-01T00%3A00%3A00.000Z&to=Z",
    );
  });

  it("links to the bare skill with no params, and drops params it does not own", () => {
    expect(skillHref("b", "")).toBe("/skills/b");
    expect(skillHref("b", "?q=foo&page=2")).toBe("/skills/b");
    expect(skillHref("b", "?tab=preview&q=foo")).toBe("/skills/b?tab=preview");
  });

  it("encodes the id", () => {
    expect(skillHref("a/b", "")).toBe("/skills/a%2Fb");
  });
});
