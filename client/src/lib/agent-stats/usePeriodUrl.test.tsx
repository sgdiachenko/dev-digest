import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { usePeriodUrl } from "./usePeriodUrl";
import { resolvePreset, periodSearchParams } from "./period";

const replace = vi.hoisted(() => vi.fn());
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/agents/a1",
  useSearchParams: () => new URLSearchParams(search),
}));

const NOW = Date.parse("2026-10-15T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  search = "";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  replace.mockReset();
});

function target(call: number): URLSearchParams {
  const url = String(replace.mock.calls[call]![0]);
  return new URLSearchParams(url.split("?")[1]);
}

describe("usePeriodUrl", () => {
  it("a valid URL gives exactly that period and never replaces (AC-51)", () => {
    const p = { option: "custom" as const, from: "2026-09-01T00:00:00.000Z", to: "2026-09-10T00:00:00.000Z" };
    search = periodSearchParams(new URLSearchParams("tab=stats"), p).toString();
    const { result } = renderHook(() => usePeriodUrl({ enabled: true }));
    expect(result.current.period).toEqual(p);
    expect(result.current.option).toBe("custom");
    expect(result.current.notice).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("missing params write the 30d fallback once, resolved once, and keep tab (AC-52)", () => {
    search = "tab=stats";
    const { result, rerender } = renderHook(() => usePeriodUrl({ enabled: true }));
    const fallback = resolvePreset("30d", NOW);
    expect(result.current.period).toEqual(fallback);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(target(0).get("from")).toBe(fallback.from);
    expect(target(0).get("tab")).toBe("stats");
    vi.setSystemTime(NOW + 3_600_000);
    rerender();
    expect(result.current.period).toEqual(fallback);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("writes nothing and returns no period while disabled", () => {
    const { result } = renderHook(() => usePeriodUrl({ enabled: false }));
    expect(result.current.period).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("flags a notice for invalid params and replaces them (AC-53)", () => {
    search = "range=custom&from=nope&to=nope";
    const { result } = renderHook(() => usePeriodUrl({ enabled: true }));
    expect(result.current.notice).toBe(true);
    expect(result.current.period).toEqual(resolvePreset("30d", NOW));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("resolves the fallback when the hook becomes enabled, not at mount (stale window)", () => {
    search = "tab=agent";
    const { result, rerender } = renderHook(({ enabled }) => usePeriodUrl({ enabled }), { initialProps: { enabled: false } });
    expect(replace).not.toHaveBeenCalled();
    vi.setSystemTime(NOW + 3_600_000);
    rerender({ enabled: true });
    const fresh = resolvePreset("30d", NOW + 3_600_000);
    expect(result.current.period).toEqual(fresh);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(target(0).get("to")).toBe(fresh.to);
  });

  it("select replaces with the new period, keeps tab and clears the notice (AC-50)", () => {
    search = "tab=stats&range=bad";
    const { result } = renderHook(() => usePeriodUrl({ enabled: true }));
    replace.mockReset();
    const next = resolvePreset("1d", NOW);
    act(() => result.current.select(next));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(target(0).get("range")).toBe("1d");
    expect(target(0).get("from")).toBe(next.from);
    expect(target(0).get("tab")).toBe("stats");
    expect(result.current.notice).toBe(false);
  });

  it("a preset refresh re-resolves to now and remembers the old period (AC-56, EC-25)", () => {
    const old = resolvePreset("30d", NOW - 600_000);
    search = periodSearchParams(new URLSearchParams(), old).toString();
    const { result } = renderHook(() => usePeriodUrl({ enabled: true }));
    const refetchSame = vi.fn();
    act(() => result.current.refresh({ isFetching: false, refetchSame }));
    expect(refetchSame).not.toHaveBeenCalled();
    expect(result.current.refreshFrom).toEqual(old);
    expect(target(0).get("to")).toBe(new Date(NOW).toISOString());
  });

  it("a custom refresh refetches the same query (AC-56)", () => {
    const custom = { option: "custom" as const, from: "2026-09-01T00:00:00.000Z", to: "2026-09-10T00:00:00.000Z" };
    search = periodSearchParams(new URLSearchParams(), custom).toString();
    const { result } = renderHook(() => usePeriodUrl({ enabled: true }));
    const refetchSame = vi.fn();
    act(() => result.current.refresh({ isFetching: false, refetchSame }));
    expect(refetchSame).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("refresh while a fetch is running does nothing (EC-18)", () => {
    search = periodSearchParams(new URLSearchParams(), resolvePreset("30d", NOW)).toString();
    const { result } = renderHook(() => usePeriodUrl({ enabled: true }));
    const refetchSame = vi.fn();
    act(() => result.current.refresh({ isFetching: true, refetchSame }));
    expect(refetchSame).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(result.current.refreshFrom).toBeNull();
  });
});
