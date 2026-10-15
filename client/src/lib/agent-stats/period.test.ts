import { describe, it, expect } from "vitest";
import {
  MAX_CUSTOM_DAYS,
  MAX_PERIOD_MS,
  parsePeriodParams,
  periodApiQuery,
  periodSearchParams,
  resolveCustomRange,
  resolvePreset,
  trendUnit,
  validateCustomRange,
} from "./period";

const NOW = Date.parse("2026-10-15T12:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("resolvePreset", () => {
  it("1d is now-24h..now and 30d is now-720h..now (AC-45, AC-46)", () => {
    expect(resolvePreset("1d", NOW)).toEqual({
      option: "1d",
      from: new Date(NOW - 24 * HOUR).toISOString(),
      to: new Date(NOW).toISOString(),
    });
    expect(resolvePreset("30d", new Date(NOW))).toEqual({
      option: "30d",
      from: new Date(NOW - 720 * HOUR).toISOString(),
      to: new Date(NOW).toISOString(),
    });
  });
});

describe("resolveCustomRange", () => {
  it("runs from local 00:00 of the start to local 00:00 of the day after the end (AC-47)", () => {
    const p = resolveCustomRange("2026-10-01", "2026-10-03")!;
    expect(p.option).toBe("custom");
    expect(p.from).toBe(new Date(2026, 9, 1).toISOString());
    expect(p.to).toBe(new Date(2026, 9, 4).toISOString());
    expect(resolveCustomRange("", "2026-10-03")).toBeNull();
  });
});

describe("validateCustomRange", () => {
  const today = new Date(2026, 9, 15, 10, 0);
  it("names the reason a range can't apply (AC-48, EC-9)", () => {
    expect(validateCustomRange("", "2026-10-03", today)).toEqual({ ok: false, reason: "incomplete" });
    expect(validateCustomRange("2026-10-03", "", today)).toEqual({ ok: false, reason: "incomplete" });
    expect(validateCustomRange("2026-10-05", "2026-10-03", today)).toEqual({ ok: false, reason: "startAfterEnd" });
    expect(validateCustomRange("2026-10-10", "2026-10-16", today)).toEqual({ ok: false, reason: "endInFuture" });
    expect(validateCustomRange("2026-10-10", "2026-10-15", today)).toEqual({ ok: true });
  });

  it("accepts 366 calendar days inclusive and rejects 367", () => {
    // 2025-10-15 .. 2026-10-15 is 366 days inclusive (2026 is not a leap year, 365 + 1)
    expect(validateCustomRange("2025-10-15", "2026-10-15", today)).toEqual({ ok: true });
    expect(validateCustomRange("2025-10-14", "2026-10-15", today)).toEqual({ ok: false, reason: "tooLong" });
  });
});

describe("period URL params", () => {
  const p = resolvePreset("1d", NOW);

  it("periodSearchParams writes range/from/to and keeps tab (AC-50)", () => {
    const next = periodSearchParams(new URLSearchParams("tab=stats"), p);
    expect(next.get("tab")).toBe("stats");
    expect(next.get("range")).toBe("1d");
    expect(next.get("from")).toBe(p.from);
    expect(next.get("to")).toBe(p.to);
  });

  it("valid params parse to exactly those values (AC-51)", () => {
    const custom = { option: "custom" as const, from: "2026-09-01T00:00:00.000Z", to: "2026-09-10T00:00:00.000Z" };
    const sp = periodSearchParams(new URLSearchParams(), custom);
    expect(parsePeriodParams(sp, NOW)).toEqual({ period: custom, invalid: false });
  });

  it("missing params fall back to 30d without a notice (AC-52)", () => {
    expect(parsePeriodParams(new URLSearchParams("tab=stats"), NOW)).toEqual({
      period: resolvePreset("30d", NOW),
      invalid: false,
    });
  });

  it("present but unusable params fall back and set invalid (AC-53)", () => {
    const fallback = resolvePreset("30d", NOW);
    const bad = [
      "range=weekly&from=2026-09-01T00:00:00.000Z&to=2026-09-10T00:00:00.000Z",
      "range=custom&from=nope&to=2026-09-10T00:00:00.000Z",
      "range=custom&from=2026-09-10T00:00:00.000Z&to=2026-09-01T00:00:00.000Z",
      "range=30d",
      "from=2026-09-01T00:00:00.000Z",
    ];
    for (const q of bad) expect(parsePeriodParams(new URLSearchParams(q), NOW)).toEqual({ period: fallback, invalid: true });
    const tooLong = new URLSearchParams({
      range: "custom",
      from: new Date(NOW - MAX_PERIOD_MS - DAY).toISOString(),
      to: new Date(NOW).toISOString(),
    });
    expect(parsePeriodParams(tooLong, NOW).invalid).toBe(true);
  });

  it("periodApiQuery URL-encodes from and to", () => {
    expect(periodApiQuery(p)).toBe(`from=${encodeURIComponent(p.from)}&to=${encodeURIComponent(p.to)}`);
  });
});

describe("limits and trendUnit", () => {
  it("pins the limits (NFR-6) and the bucket unit boundaries (EC-31)", () => {
    expect(MAX_CUSTOM_DAYS).toBe(366);
    expect(MAX_PERIOD_MS).toBe(367 * DAY);
    expect(trendUnit(2 * DAY)).toBe("hour");
    expect(trendUnit(2 * DAY + 1)).toBe("day");
    expect(trendUnit(90 * DAY)).toBe("day");
    expect(trendUnit(91 * DAY)).toBe("week");
  });
});
