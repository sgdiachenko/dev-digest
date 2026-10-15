import { describe, it, expect } from "vitest";
import { acceptArrow, acceptLevel, wholePercent } from "./accept";

describe("acceptLevel", () => {
  it("scales on the displayed whole percent (AC-115)", () => {
    expect(acceptLevel(0.745, false)).toBe("good");
    expect(acceptLevel(0.744, false)).toBe("warning");
    expect(acceptLevel(0.495, false)).toBe("warning");
    expect(acceptLevel(0.494, false)).toBe("poor");
    expect(acceptLevel(0.9, true)).toBe("muted");
    expect(acceptLevel(null, false)).toBe("muted");
  });
  it("rounds halves up", () => {
    expect(wholePercent(0.745)).toBe(75);
    expect(wholePercent(null)).toBeNull();
  });
});

describe("acceptArrow", () => {
  it("needs at least one displayed point (AC-140)", () => {
    expect(acceptArrow(0.8, false, 0.79, false)).toEqual({ direction: "up", points: 1 });
    expect(acceptArrow(0.6, false, 0.8, false)).toEqual({ direction: "down", points: 20 });
    expect(acceptArrow(0.804, false, 0.8, false)).toBeNull();
  });
  it("shows nothing when either side is null or a small sample (AC-141)", () => {
    expect(acceptArrow(null, false, 0.5, false)).toBeNull();
    expect(acceptArrow(0.5, false, null, false)).toBeNull();
    expect(acceptArrow(0.9, true, 0.5, false)).toBeNull();
    expect(acceptArrow(0.9, false, 0.5, true)).toBeNull();
  });
});
