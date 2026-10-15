import { describe, it, expect } from "vitest";
import { ApiError } from "../../../../../../../lib/api";
import { bucketEnd, bucketLabel, bucketTotal, isApiStatus, maxBucketTotal, topSkills } from "./helpers";

const skill = (id: string, runs: number, name: string | null = id) => ({ skill_id: id, skill_name: name, runs });
const bucket = (start: string, c: number, w: number, s: number) => ({ bucket_start: start, CRITICAL: c, WARNING: w, SUGGESTION: s });

describe("topSkills", () => {
  it("keeps the five largest shares of the runs with skill data, ties in server order", () => {
    const skills = [skill("a", 1), skill("b", 9), skill("c", 3), skill("d", 3), skill("e", 2), skill("f", 6), skill("g", 5)];
    const top = topSkills(skills, 9);
    expect(top.map((s) => s.skillId)).toEqual(["b", "f", "g", "c", "d"]);
    expect(top.map((s) => s.percent)).toEqual([100, 67, 56, 33, 33]);
  });

  it("is empty without runs that recorded a skill list and keeps a deleted skill's null name", () => {
    expect(topSkills([skill("a", 2)], 0)).toEqual([]);
    expect(topSkills([skill("a", 1, null)], 2)[0]).toMatchObject({ name: null, percent: 50 });
  });
});

describe("severity buckets", () => {
  it("totals a bucket and finds the tallest one", () => {
    const buckets = [bucket("2026-10-13T00:00:00.000Z", 1, 2, 3), bucket("2026-10-14T00:00:00.000Z", 0, 1, 0)];
    expect(bucketTotal(buckets[0]!)).toBe(6);
    expect(maxBucketTotal(buckets)).toBe(6);
    expect(maxBucketTotal([])).toBe(0);
  });

  it("ends a bucket at the next bucket's start, the last one at the period end", () => {
    const buckets = [bucket("2026-10-13T00:00:00.000Z", 0, 0, 0), bucket("2026-10-14T00:00:00.000Z", 0, 0, 0)];
    expect(bucketEnd(buckets, 0, "2026-10-15T00:00:00.000Z")).toBe("2026-10-14T00:00:00.000Z");
    expect(bucketEnd(buckets, 1, "2026-10-15T00:00:00.000Z")).toBe("2026-10-15T00:00:00.000Z");
  });

  it("labels a one-day bucket with one date, a weekly one with a range, an hourly one with date and time", () => {
    const fmt = { date: (iso: string) => iso.slice(5, 10), dateTime: (iso: string) => iso.slice(5, 16) };
    expect(bucketLabel("2026-10-13T00:00:00.000Z", "2026-10-14T00:00:00.000Z", "day", fmt)).toBe("10-13");
    expect(bucketLabel("2026-10-06T00:00:00.000Z", "2026-10-13T00:00:00.000Z", "week", fmt)).toBe("10-06 – 10-12");
    expect(bucketLabel("2026-10-13T05:00:00.000Z", "2026-10-13T06:00:00.000Z", "hour", fmt)).toBe("10-13T05:00");
  });
});

describe("isApiStatus", () => {
  it("matches only an ApiError with that status", () => {
    expect(isApiStatus(new ApiError("x", 404), 404)).toBe(true);
    expect(isApiStatus(new ApiError("x", 422), 404)).toBe(false);
    expect(isApiStatus(new Error("x"), 404)).toBe(false);
  });
});
