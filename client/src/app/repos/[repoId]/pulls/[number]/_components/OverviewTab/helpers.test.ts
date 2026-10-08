import { describe, it, expect } from "vitest";
import type { ReviewRecord, Settings } from "@devdigest/shared";
import {
  middleTruncate,
  shortSha,
  formatBriefCost,
  relativeTime,
  riskModelLabel,
  latestReview,
  missingFixHref,
  parseFileRef,
  SEVERITY_META,
} from "./helpers";

const review = (id: string, created_at: string, kind: "review" | "summary" = "review"): ReviewRecord =>
  ({ id, created_at, kind, verdict: "approve", findings: [] }) as unknown as ReviewRecord;

describe("brief helpers", () => {
  it("middleTruncate keeps short paths and cuts the middle of long ones, keeping the file name", () => {
    expect(middleTruncate("src/a.ts", 48)).toBe("src/a.ts");
    const long = "src/very/deeply/nested/folder/structure/that/goes/on/forever/file-name.ts";
    const out = middleTruncate(long, 30);
    expect(out).toHaveLength(30);
    expect(out).toContain("…");
    expect(out.endsWith("file-name.ts")).toBe(true);
  });

  it("shortSha returns 7 characters", () => {
    expect(shortSha("0123456789abcdef")).toBe("0123456");
  });

  it("formatBriefCost distinguishes null (not reported) from 0", () => {
    expect(formatBriefCost(null, "cost not reported")).toBe("cost not reported");
    expect(formatBriefCost(0, "x")).toBe("$0.00");
    expect(formatBriefCost(0.0042, "x")).toBe("$0.0042");
    expect(formatBriefCost(1.234, "x")).toBe("$1.23");
  });

  it("relativeTime returns a catalog key and count", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    expect(relativeTime("2026-10-02T09:00:00Z", now)).toEqual({ key: "hours", count: 3 });
    expect(relativeTime("2026-09-30T12:00:00Z", now)).toEqual({ key: "days", count: 2 });
    expect(relativeTime("2026-10-02T11:45:00Z", now)).toEqual({ key: "minutes", count: 15 });
    expect(relativeTime("2026-10-02T11:59:50Z", now)).toEqual({ key: "justNow" });
    expect(relativeTime("2026-10-02T12:05:00Z", now)).toEqual({ key: "justNow" });
  });

  it("riskModelLabel prefers the workspace override, else the built-in default", () => {
    expect(riskModelLabel(undefined)).toBe("gpt-4.1");
    const s = { feature_models: { risk_brief: { provider: "openai", model: "gpt-5" } } } as unknown as Settings;
    expect(riskModelLabel(s)).toBe("gpt-5");
  });

  it("latestReview picks the single newest review, ignoring summaries (EC-31)", () => {
    const rs = [review("a", "2026-10-01T10:00:00Z"), review("b", "2026-10-01T12:00:00Z"), review("c", "2026-10-02T00:00:00Z", "summary")];
    expect(latestReview(rs)?.id).toBe("b");
    expect(latestReview([])).toBeNull();
    expect(latestReview(undefined)).toBeNull();
  });

  it("missingFixHref links intent to the anchor and specs to Project Context", () => {
    expect(missingFixHref("intent", "r1")).toBe("#intent");
    expect(missingFixHref("specs", "r1")).toBe("/repos/r1/context");
    expect(missingFixHref("blast", "r1")).toBeNull();
  });

  it("parseFileRef handles path, path:line and path:start-end", () => {
    expect(parseFileRef("src/a.ts")).toEqual({ path: "src/a.ts", line: null });
    expect(parseFileRef("src/a.ts:12")).toEqual({ path: "src/a.ts", line: 12 });
    expect(parseFileRef("src/a.ts:12-20")).toEqual({ path: "src/a.ts", line: 12 });
    expect(parseFileRef("src/a.ts:0")).toEqual({ path: "src/a.ts", line: null });
  });

  it("SEVERITY_META has an icon for every severity", () => {
    expect(Object.keys(SEVERITY_META).sort()).toEqual(["high", "low", "medium"]);
  });
});
