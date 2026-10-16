import { describe, it, expect } from "vitest";
import {
  formatAvgUsd,
  formatCount,
  formatDateTime,
  formatRelative,
  formatSeconds1,
  formatTime,
  formatTokensK,
  formatTotalUsd,
} from "./format";

describe("formatTotalUsd", () => {
  it("uses cents and separators (AC-104, EC-15)", () => {
    expect(formatTotalUsd(1234.56, "en")).toBe("$1,234.56");
  });
  it("returns the less-than marker for a cost that rounds to $0.00 (AC-135, EC-33)", () => {
    expect(formatTotalUsd(0.004, "en")).toEqual({ lessThan: "$0.01" });
    expect(formatTotalUsd(0.005, "en")).toBe("$0.01");
  });
  it("keeps null as a dash and 0 as $0.00 (EC-3)", () => {
    expect(formatTotalUsd(null, "en")).toBe("—");
    expect(formatTotalUsd(0, "en")).toBe("$0.00");
  });
});

describe("formatAvgUsd", () => {
  it("shows two significant digits under $1 and cents from $1 (Q-8)", () => {
    expect(formatAvgUsd(0.0013, "en")).toBe("$0.0013");
    expect(formatAvgUsd(0.0381818, "en")).toBe("$0.038");
    expect(formatAvgUsd(0.5, "en")).toBe("$0.50");
    expect(formatAvgUsd(1.234, "en")).toBe("$1.23");
    expect(formatAvgUsd(null, "en")).toBe("—");
    expect(formatAvgUsd(0, "en")).toBe("$0.00");
  });
});

describe("other formatters", () => {
  it("formats seconds with one decimal (AC-117)", () => {
    expect(formatSeconds1(6200, "en")).toBe("6.2");
    expect(formatSeconds1(null, "en")).toBe("—");
  });
  it("sums tokens, in thousands from 1000 (AC-159)", () => {
    expect(formatTokensK(14000, 2100, "en")).toEqual({ thousands: "16" });
    expect(formatTokensK(300, 200, "en")).toEqual({ text: "500" });
    expect(formatTokensK(null, null, "en")).toEqual({ text: "—" });
  });
  it("separates thousands in counts", () => {
    expect(formatCount(1000, "en")).toBe("1,000");
  });
  it("formats time zone independent text (NFR-20)", () => {
    expect(formatTime("2026-10-15T14:05:00.000Z", "en", "UTC")).toBe("14:05");
    expect(formatDateTime("2026-10-15T14:05:00.000Z", "en", "UTC")).toContain("14:05");
  });
  it("formats relative time against the given now", () => {
    expect(formatRelative("2026-10-15T11:00:00.000Z", "2026-10-15T12:00:00.000Z", "en")).toBe("1 hour ago");
    expect(formatRelative("2026-10-15T12:00:00.000Z", "2026-10-15T12:00:00.000Z", "en")).toBe("this minute");
  });
});
