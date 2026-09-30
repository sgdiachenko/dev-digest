import { describe, it, expect } from "vitest";
import type { AttachedDoc, ContextDoc } from "@/lib/types";
import { applyDraft, docKey, mergeForPut, moveId, moveIdTo, ownForRepo, refsOf, rowsFor, toggleId } from "./helpers";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function att(repo_id: string, path: string, position: number, o: Partial<AttachedDoc> = {}): AttachedDoc {
  return { repo_id, path, position, category: "docs", est_tokens: 10, status: "ok", would_skip: null, ...o };
}
function cat(path: string, o: Partial<ContextDoc> = {}): ContextDoc {
  return { path, category: "docs", size: 1, est_tokens: 5, status: "ok", secret_warning: false, used_by: null, ...o };
}

describe("reorder / toggle", () => {
  it("moves by one, clamps at the edges, moves to a target, toggles", () => {
    expect(moveId(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
    expect(moveIdTo(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveIdTo(["a", "b"], "a", "zzz")).toEqual(["a", "b"]);
    expect(toggleId(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a", false)).toEqual(["b"]);
  });
});

describe("ownForRepo / mergeForPut", () => {
  const own = [att(A, "a1.md", 0), att(B, "b1.md", 1), att(A, "a2.md", 2)];

  it("filters the selected repo's attachments", () => {
    expect(ownForRepo(own, A).map((d) => d.path)).toEqual(["a1.md", "a2.md"]);
  });

  it("keeps other repos untouched and replaces the selected repo's slots in order", () => {
    const ordered = [
      { repo_id: A, path: "a2.md" },
      { repo_id: A, path: "a1.md" },
    ];
    expect(mergeForPut(own, A, ordered)).toEqual([
      { repo_id: A, path: "a2.md" },
      { repo_id: B, path: "b1.md" },
      { repo_id: A, path: "a1.md" },
    ]);
  });

  it("appends additions and drops removed slots, sending only ref fields", () => {
    expect(mergeForPut(own, A, [{ repo_id: A, path: "n.md" }])).toEqual([
      { repo_id: A, path: "n.md" },
      { repo_id: B, path: "b1.md" },
    ]);
    expect(mergeForPut(own, B, [{ repo_id: B, path: "b1.md" }, { repo_id: B, path: "b2.md" }])).toEqual([
      { repo_id: A, path: "a1.md" },
      { repo_id: B, path: "b1.md" },
      { repo_id: A, path: "a2.md" },
      { repo_id: B, path: "b2.md" },
    ]);
  });
});

describe("rowsFor / applyDraft", () => {
  const files = [cat("x.md"), cat("a1.md"), cat("big.md", { status: "too_large", est_tokens: null })];
  const own = [att(A, "a1.md", 1), att(A, "gone.md", 0, { status: "missing", category: null, est_tokens: null })];

  it("lists attached first in stored order (missing included), then the rest of the catalog", () => {
    const rows = rowsFor(files, own, A);
    expect(rows.map((r) => [r.path, r.attached, r.status])).toEqual([
      ["gone.md", true, "missing"],
      ["a1.md", true, "ok"],
      ["x.md", false, "ok"],
      ["big.md", false, "too_large"],
    ]);
  });

  it("applies a draft order, and detaching a missing row removes it", () => {
    const rows = rowsFor(files, own, A);
    const shown = applyDraft(rows, [docKey({ repo_id: A, path: "x.md" }), docKey({ repo_id: A, path: "a1.md" })]);
    expect(shown.map((r) => [r.path, r.attached])).toEqual([
      ["x.md", true],
      ["a1.md", true],
      ["big.md", false],
    ]);
    expect(refsOf(shown)).toEqual([
      { repo_id: A, path: "x.md" },
      { repo_id: A, path: "a1.md" },
    ]);
  });
});
