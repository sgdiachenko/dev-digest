import { describe, it, expect } from "vitest";
import { buildDiffHref, parseFileTarget, parseLine, withoutTarget } from "./file-target";

const FILES = ["src/a.ts", "docs/readme.md"];
const qs = (s: string) => new URLSearchParams(s);

describe("file-target", () => {
  it("accepts only positive integers as a line", () => {
    expect(parseLine("12")).toBe(12);
    for (const bad of ["0", "-3", "abc", "1.5", "", "01", "1e3", "99999999999999999999"]) {
      expect(parseLine(bad)).toBeNull();
    }
    expect(parseLine(null)).toBeNull();
  });

  it("targets the file only when the line is invalid (AC-98)", () => {
    const t = parseFileTarget(qs("tab=diff&file=src/a.ts&line=-3"), FILES);
    expect(t).toMatchObject({ path: "src/a.ts", line: null, inPr: true });
  });

  it("keeps a valid line and builds a per-target key", () => {
    const a = parseFileTarget(qs("tab=diff&file=src/a.ts&line=7"), FILES)!;
    const b = parseFileTarget(qs("tab=diff&file=src/a.ts&line=8"), FILES)!;
    expect(a.line).toBe(7);
    expect(a.key).not.toBe(b.key);
  });

  it("flags a file outside the PR instead of trusting it (AC-95)", () => {
    expect(parseFileTarget(qs("tab=diff&file=../../etc/passwd&line=1"), FILES)).toMatchObject({ inPr: false });
  });

  it("returns null without tab=diff or without a file", () => {
    expect(parseFileTarget(qs("tab=overview&file=src/a.ts"), FILES)).toBeNull();
    expect(parseFileTarget(qs("tab=diff"), FILES)).toBeNull();
  });

  it("builds a diff href keeping other params, and strips the target again", () => {
    const href = buildDiffHref("r1", "42", qs("tab=overview&trace=run9"), "src/a b.ts", 5);
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/repos/r1/pulls/42");
    expect(url.searchParams.get("tab")).toBe("diff");
    expect(url.searchParams.get("file")).toBe("src/a b.ts");
    expect(url.searchParams.get("line")).toBe("5");
    expect(url.searchParams.get("trace")).toBe("run9");

    expect(new URL(buildDiffHref("r1", "42", qs(""), "x.ts", null), "http://x").searchParams.has("line")).toBe(false);
    const stripped = withoutTarget(url.searchParams);
    expect(stripped.has("file") || stripped.has("line")).toBe(false);
    expect(stripped.get("trace")).toBe("run9");
  });
});
