import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, SmartDiff, SmartDiffGroup } from "@devdigest/shared";
import { diffTotals, findingsForSmartDiff, orderFilesByRole } from "./helpers";

function prFile(o: Partial<PrFile> = {}): PrFile {
  return { path: "a.ts", additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+x", ...o };
}

function smartFile(o: Partial<SmartDiffGroup["files"][number]> = {}): SmartDiffGroup["files"][number] {
  return { path: "a.ts", additions: 1, deletions: 0, finding_ids: [], finding_lines: [], ...o };
}

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "A finding",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
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

describe("orderFilesByRole", () => {
  it("resolves smart-diff files into the actual PrFiles (with patch), sorted by pr.files order", () => {
    const prFiles = [prFile({ path: "z.ts" }), prFile({ path: "a.ts" }), prFile({ path: "m.ts" })];
    const groups: SmartDiffGroup[] = [
      { role: "core", files: [smartFile({ path: "m.ts" }), smartFile({ path: "z.ts" }), smartFile({ path: "a.ts" })] },
    ];
    const resolved = orderFilesByRole(groups, prFiles);
    expect(resolved[0]!.files.map((f) => f.path)).toEqual(["z.ts", "a.ts", "m.ts"]);
    // The resolved file is the real PrFile (carries patch), not the smart-diff stub.
    expect(resolved[0]!.files[0]!.patch).toBe(prFiles[0]!.patch);
  });

  it("D10: a pr.files path missing from the smart-diff response is appended to core", () => {
    const prFiles = [prFile({ path: "a.ts" }), prFile({ path: "new-file.ts" })];
    const groups: SmartDiffGroup[] = [{ role: "core", files: [smartFile({ path: "a.ts" })] }];
    const resolved = orderFilesByRole(groups, prFiles);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.role).toBe("core");
    expect(resolved[0]!.files.map((f) => f.path)).toEqual(["a.ts", "new-file.ts"]);
  });

  it("D10: creates a core group for the missing files when the response had none", () => {
    const prFiles = [prFile({ path: "new-file.ts" })];
    const groups: SmartDiffGroup[] = [{ role: "tests", files: [] }];
    const resolved = orderFilesByRole(groups, prFiles);
    expect(resolved.map((g) => g.role)).toContain("core");
    expect(resolved.find((g) => g.role === "core")!.files.map((f) => f.path)).toEqual(["new-file.ts"]);
  });
});

describe("findingsForSmartDiff", () => {
  it("keeps only findings whose id is referenced by the smart-diff's finding_ids", () => {
    const smartDiff: SmartDiff = {
      groups: [
        { role: "core", files: [smartFile({ path: "a.ts", finding_ids: ["f1"] })] },
      ],
      split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] },
    };
    const findings = [finding({ id: "f1" }), finding({ id: "f-stale-not-in-smart-diff" })];
    expect(findingsForSmartDiff(smartDiff, findings).map((f) => f.id)).toEqual(["f1"]);
  });
});

describe("diffTotals", () => {
  it("sums additions/deletions across every file, independent of grouping", () => {
    const files = [
      { additions: 4, deletions: 1 },
      { additions: 10, deletions: 0 },
    ];
    expect(diffTotals(files)).toEqual({ files: 2, additions: 14, deletions: 1 });
  });

  it("zero files → zero totals", () => {
    expect(diffTotals([])).toEqual({ files: 0, additions: 0, deletions: 0 });
  });
});
