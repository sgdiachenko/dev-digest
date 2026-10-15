import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAgentPerformance, useAgentRunHistory, useAgentStats } from "./agent-stats";

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

describe("agent stats hooks", () => {
  it("send only GET requests with from and to URL-encoded (AC-41)", async () => {
    fetchMock.mockImplementation(() => json({ ok: true }));
    const { Wrapper } = wrapper();
    const { result } = renderHook(
      () => ({
        perf: useAgentPerformance(PERIOD),
        stats: useAgentStats("a1", PERIOD),
        runs: useAgentRunHistory("a1", PERIOD, 2),
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() => {
      expect(result.current.perf.isSuccess && result.current.stats.isSuccess && result.current.runs.isSuccess).toBe(true);
    });
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    const enc = `from=${encodeURIComponent(PERIOD.from)}&to=${encodeURIComponent(PERIOD.to)}`;
    expect(urls.some((u) => u.endsWith(`/agents/performance?${enc}`))).toBe(true);
    expect(urls.some((u) => u.endsWith(`/agents/a1/stats?${enc}`))).toBe(true);
    expect(urls.some((u) => u.endsWith(`/agents/a1/stats/runs?${enc}&page=2`))).toBe(true);
    for (const [, init] of fetchMock.mock.calls) expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
  });

  it("do not fetch without a period (enabled follows the period)", async () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useAgentPerformance(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("share one request between two consumers of the same period (AC-42)", async () => {
    fetchMock.mockImplementation(() => json({ ok: true }));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => [useAgentPerformance(PERIOD), useAgentPerformance(PERIOD)] as const, {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current[0].isSuccess && result.current[1].isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never refetch on a timer (AC-43, EC-8)", async () => {
    fetchMock.mockImplementation(() => json({ ok: true }));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useAgentStats("a1", PERIOD), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 422 but retries a 500 once", async () => {
    fetchMock.mockImplementation(() => json({ error: { code: "invalid", message: "bad" } }, 422));
    const first = wrapper();
    const bad = renderHook(() => useAgentPerformance(PERIOD), { wrapper: first.Wrapper });
    await waitFor(() => expect(bad.result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    cleanup();

    fetchMock.mockReset();
    fetchMock.mockImplementation(() => json({ error: { code: "boom", message: "boom" } }, 500));
    const second = wrapper();
    const down = renderHook(() => useAgentPerformance(PERIOD), { wrapper: second.Wrapper });
    await waitFor(() => expect(down.result.current.isError).toBe(true), { timeout: 5000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10_000);
});
