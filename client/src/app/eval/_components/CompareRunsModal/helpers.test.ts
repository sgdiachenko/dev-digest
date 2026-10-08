import { describe, it, expect } from "vitest";
import { orderByStart, wordDiff } from "./helpers";

const text = (segs: ReturnType<typeof wordDiff>, type: string) =>
  segs.filter((s) => s.type === type).map((s) => s.text.trim());

describe("wordDiff (T45)", () => {
  it("returns the minimal word removals and additions", () => {
    const segs = wordDiff("Return at most 5 findings ranked by severity.", "Return at most 3 findings ranked by severity.");
    expect(text(segs, "del")).toEqual(["5"]);
    expect(text(segs, "add")).toEqual(["3"]);
    expect(segs.map((s) => s.text).join("")).toContain("Return at most ");
  });

  it("marks an inserted sentence as an addition only", () => {
    const segs = wordDiff("Examine the diff.", "Examine the diff. Flag unused imports.");
    expect(text(segs, "del")).toEqual([]);
    expect(text(segs, "add").join(" ")).toContain("Flag unused imports.");
  });

  it("reconstructs both texts from the segments, and equal texts have no changes", () => {
    const a = "one two three four";
    const b = "one 2 three five six";
    const segs = wordDiff(a, b);
    expect(segs.filter((s) => s.type !== "add").map((s) => s.text).join("")).toBe(a);
    expect(segs.filter((s) => s.type !== "del").map((s) => s.text).join("")).toBe(b);
    expect(wordDiff("same text", "same text")).toEqual([{ type: "same", text: "same text" }]);
    expect(wordDiff("", "")).toEqual([]);
  });
});

describe("orderByStart", () => {
  it("puts the older run first regardless of the argument order", () => {
    const early = { id: "e", started_at: "2026-05-01T00:00:00Z" };
    const late = { id: "l", started_at: "2026-05-02T00:00:00Z" };
    expect(orderByStart(late, early)).toEqual([early, late]);
    expect(orderByStart(early, late)).toEqual([early, late]);
  });
});
