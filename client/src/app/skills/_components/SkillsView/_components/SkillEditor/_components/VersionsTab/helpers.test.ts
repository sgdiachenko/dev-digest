import { describe, it, expect } from "vitest";
import { lineDiff } from "./helpers";

describe("lineDiff", () => {
  it("returns all context for identical bodies", () => {
    const body = "line 1\nline 2";
    expect(lineDiff(body, body).every((l) => l.kind === "ctx")).toBe(true);
  });

  it("marks an appended line as an add", () => {
    const out = lineDiff("# Rule\nOne.", "# Rule\nOne.\nTwo.");
    expect(out.at(-1)).toEqual({ kind: "add", text: "Two." });
  });

  it("marks a removed line as a del", () => {
    const out = lineDiff("# Rule\nOne.\nTwo.", "# Rule\nOne.");
    expect(out.at(-1)).toEqual({ kind: "del", text: "Two." });
  });
});
