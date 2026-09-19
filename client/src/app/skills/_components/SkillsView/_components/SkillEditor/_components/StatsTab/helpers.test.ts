import { describe, it, expect } from "vitest";
import { formatPct, maxCategoryCount } from "./helpers";

describe("formatPct", () => {
  it("renders — for null (not enough data), never 0%", () => {
    expect(formatPct(null)).toBe("—");
  });

  it("renders a real percentage, including 0", () => {
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(71)).toBe("71%");
    expect(formatPct(100)).toBe("100%");
  });
});

describe("maxCategoryCount", () => {
  it("returns the largest count for bar scaling", () => {
    expect(maxCategoryCount([{ count: 2 }, { count: 9 }, { count: 4 }])).toBe(9);
  });

  it("returns 1 (not 0) for an empty list, so a div-by-zero never happens", () => {
    expect(maxCategoryCount([])).toBe(1);
  });
});
