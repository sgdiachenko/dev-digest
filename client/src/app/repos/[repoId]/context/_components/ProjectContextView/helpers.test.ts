import { describe, it, expect, vi, afterEach } from "vitest";
import type { ContextDoc } from "@/lib/types";
import {
  filterDocs,
  formatSize,
  isNoMatch,
  parseViewState,
  relativeTime,
  shortSha,
  toSearch,
  truncateMiddle,
} from "./helpers";

function doc(path: string, category: ContextDoc["category"]): ContextDoc {
  return {
    path,
    category,
    size: 10,
    est_tokens: 3,
    status: "ok",
    secret_warning: false,
    used_by: { agents: [], skills: [] },
  };
}

const FILES = [
  doc(".devdigest/specs/Auth.md", "specs"),
  doc("docs/setup.md", "docs"),
  doc("INSIGHTS.md", "insights"),
];

afterEach(() => vi.useRealTimers());

describe("filterDocs", () => {
  it("matches the path substring case-insensitively", () => {
    expect(filterDocs(FILES, "AUTH", []).map((f) => f.path)).toEqual([".devdigest/specs/Auth.md"]);
    expect(filterDocs(FILES, "  setup ", []).map((f) => f.path)).toEqual(["docs/setup.md"]);
  });

  it("filters by selected categories; an empty set means all, server order is kept", () => {
    expect(filterDocs(FILES, "", [])).toEqual(FILES);
    expect(filterDocs(FILES, "", ["docs", "insights"]).map((f) => f.category)).toEqual([
      "docs",
      "insights",
    ]);
    expect(filterDocs(FILES, "md", ["specs"])).toHaveLength(1);
  });
});

describe("isNoMatch", () => {
  it("is true only when documents exist but none pass the filters", () => {
    expect(isNoMatch(FILES, [])).toBe(true);
    expect(isNoMatch(FILES, FILES)).toBe(false);
    expect(isNoMatch([], [])).toBe(false);
  });
});

describe("view state <-> search params", () => {
  it("round-trips q, categories and doc", () => {
    const state = { q: "a b", cats: ["specs", "insights"] as const, doc: "docs/x y.md" };
    const search = toSearch({ ...state, cats: [...state.cats] });
    expect(parseViewState(new URLSearchParams(search))).toEqual({ ...state, cats: [...state.cats] });
  });

  it("emits nothing for the default state and drops unknown categories", () => {
    expect(toSearch({ q: "", cats: [], doc: null })).toBe("");
    expect(parseViewState(new URLSearchParams("cat=bogus,docs"))).toEqual({
      q: "",
      cats: ["docs"],
      doc: null,
    });
  });
});

describe("truncateMiddle", () => {
  it("leaves short paths alone and elides the middle of a 121-char path within 120", () => {
    expect(truncateMiddle("a/b.md")).toBe("a/b.md");
    const path = `${"d".repeat(60)}/${"f".repeat(60)}`;
    expect(path).toHaveLength(121);
    const out = truncateMiddle(path);
    expect(out).toHaveLength(120);
    expect(out).toContain("…");
    expect(out.startsWith("d")).toBe(true);
    expect(out.endsWith("f")).toBe(true);
    expect(out.indexOf("…")).toBeGreaterThan(0);
    expect(out.indexOf("…")).toBeLessThan(out.length - 1);
  });
});

describe("relativeTime / formatSize / shortSha", () => {
  it("formats elapsed time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    expect(relativeTime("2026-09-30T11:59:40Z")).toBe("less than a minute ago");
    expect(relativeTime("2026-09-30T11:30:00Z")).toBe("30m ago");
    expect(relativeTime("2026-09-30T09:00:00Z")).toBe("3h ago");
    expect(relativeTime("2026-09-27T12:00:00Z")).toBe("3d ago");
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime("garbage")).toBe("—");
  });

  it("formats sizes and short shas", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(shortSha("0123456789abcdef")).toBe("0123456");
    expect(shortSha(null)).toBe("");
  });
});
