import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { findingKey, partitionFindings, topSeverity } from "./findings";

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "A finding",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "because",
    suggestion: null,
    confidence: 0.8,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

describe("findingKey", () => {
  it("keys a finding to its RIGHT-side start_line", () => {
    expect(findingKey({ start_line: 11 })).toBe("RIGHT:11");
  });
});

describe("topSeverity", () => {
  it("returns the most severe of CRITICAL > WARNING > SUGGESTION", () => {
    const findings = [
      finding({ id: "w", severity: "WARNING" }),
      finding({ id: "c", severity: "CRITICAL" }),
      finding({ id: "s", severity: "SUGGESTION" }),
    ];
    expect(topSeverity(findings)).toBe("CRITICAL");
  });

  it("returns null for an empty list", () => {
    expect(topSeverity([])).toBeNull();
  });
});

describe("partitionFindings", () => {
  it("matches findings whose start_line is a rendered key, and buckets the rest as outside", () => {
    const inDiff = finding({ id: "in-diff", start_line: 11 });
    const outside = finding({ id: "outside", start_line: 999 });
    const { matched, outside: out } = partitionFindings([inDiff, outside], new Set(["RIGHT:11"]));
    expect(matched.get("RIGHT:11")).toEqual([inDiff]);
    expect(out).toEqual([outside]);
  });

  it("groups multiple findings on the same line under one key", () => {
    const a = finding({ id: "a", start_line: 11 });
    const b = finding({ id: "b", start_line: 11 });
    const { matched } = partitionFindings([a, b], new Set(["RIGHT:11"]));
    expect(matched.get("RIGHT:11")).toEqual([a, b]);
  });
});
