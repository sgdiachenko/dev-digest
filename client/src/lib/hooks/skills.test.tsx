import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { skillKeys, useSkillStats } from "./skills";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

function wrapper() {
  const qc = new QueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

const PERIOD = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-15T12:30:00.000Z" };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  fetchMock.mockReset();
});

describe("useSkillStats", () => {
  it("sends one GET with from and to URL-encoded (skill AC-17)", async () => {
    fetchMock.mockImplementation(() => json({ ok: true }));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useSkillStats("s1", PERIOD), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url).endsWith(`/skills/s1/stats?from=${encodeURIComponent(PERIOD.from)}&to=${encodeURIComponent(PERIOD.to)}`)).toBe(true);
    expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
  });

  it("does not fetch without a period or an id", () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => [useSkillStats("s1", null), useSkillStats(null, PERIOD)] as const, {
      wrapper: Wrapper,
    });
    expect(result.current[0].fetchStatus).toBe("idle");
    expect(result.current[1].fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shares one request between two consumers of the same period (skill AC-17)", async () => {
    fetchMock.mockImplementation(() => json({ ok: true }));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => [useSkillStats("s1", PERIOD), useSkillStats("s1", PERIOD)] as const, {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current[0].isSuccess && result.current[1].isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never refetches on a timer (skill AC-17, EC-19)", async () => {
    fetchMock.mockImplementation(() => json({ ok: true }));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useSkillStats("s1", PERIOD), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 404 or a 422 but retries a 500 once", async () => {
    for (const status of [404, 422]) {
      fetchMock.mockReset();
      fetchMock.mockImplementation(() => json({ error: { code: "x", message: "no" } }, status));
      const w = wrapper();
      const bad = renderHook(() => useSkillStats("s1", PERIOD), { wrapper: w.Wrapper });
      await waitFor(() => expect(bad.result.current.isError).toBe(true));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      cleanup();
    }
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => json({ error: { code: "boom", message: "boom" } }, 500));
    const w = wrapper();
    const down = renderHook(() => useSkillStats("s1", PERIOD), { wrapper: w.Wrapper });
    await waitFor(() => expect(down.result.current.isError).toBe(true), { timeout: 5000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10_000);
});

describe("skillKeys.stats", () => {
  it("without a period is the prefix of a period key, so the existing invalidation still matches", async () => {
    fetchMock.mockImplementation(() => json({ ok: true }));
    const { qc, Wrapper } = wrapper();
    const { result } = renderHook(() => useSkillStats("s1", PERIOD), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(skillKeys.stats("s1")).toEqual(["skill-stats", "s1"]);
    expect(skillKeys.stats("s1", PERIOD)).toEqual(["skill-stats", "s1", PERIOD.from, PERIOD.to]);
    await qc.invalidateQueries({ queryKey: skillKeys.stats("s1") });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
