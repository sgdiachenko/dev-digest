import { describe, it, expect } from "vitest";
import { largestRemainderCents, sharePercents, topFivePlusOther } from "./breakdown";

describe("topFivePlusOther", () => {
  it("keeps five and sums the rest into Other (AC-133, EC-13)", () => {
    const entries = [3, 9, 1, 7, 5, 4, 2].map((v) => ({ key: `k${v}`, label: `L${v}`, value: v }));
    const out = topFivePlusOther(entries, "Other");
    expect(out.map((e) => e.value)).toEqual([9, 7, 5, 4, 3, 3]);
    expect(out[5]).toMatchObject({ label: "Other", value: 3 });
    expect(topFivePlusOther(entries.slice(0, 5), "Other")).toHaveLength(5);
  });
});

describe("largestRemainderCents", () => {
  it("sums to round(total*100) (AC-134)", () => {
    const cents = largestRemainderCents([0.333, 0.333, 0.334], 1.0);
    expect(cents.reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("always sums to the target for random sets", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let n = 0; n < 200; n++) {
      const amounts = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => rnd() * 3);
      const total = amounts.reduce((a, b) => a + b, 0);
      const cents = largestRemainderCents(amounts, total);
      expect(cents.reduce((a, b) => a + b, 0)).toBe(Math.round(total * 100));
    }
  });
});

describe("sharePercents", () => {
  it("rounds each share and guards a zero total", () => {
    expect(sharePercents([1, 1, 2], 4)).toEqual([25, 25, 50]);
    expect(sharePercents([0, 0], 0)).toEqual([0, 0]);
  });
});
