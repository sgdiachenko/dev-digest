import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCiInstallations, useExportCi, useCiRuns, useRefreshCiRuns } from "./ci";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, invalidate, Wrapper };
}

const urlOf = (call: unknown[]) => String(call[0]);
const initOf = (call: unknown[]) => (call[1] ?? {}) as RequestInit;
const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

describe("ci hooks", () => {
  it("useCiInstallations GETs the agent's installations (AC-72)", async () => {
    fetchMock.mockImplementation(() => json([{ id: "i1" }]));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useCiInstallations("ag1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urlOf(fetchMock.mock.calls[0]!)).toMatch(/\/agents\/ag1\/ci-installations$/);
    expect(result.current.data).toEqual([{ id: "i1" }]);
  });

  it("useExportCi posts the body to export-ci; open_pr invalidates installations and runs, files does not", async () => {
    fetchMock.mockImplementation(() => json({ installation: null, files: [], pr_url: null, pr_number: null, pr_reused: false }));
    const { Wrapper, invalidate } = wrapper();
    const { result } = renderHook(() => useExportCi("ag1"), { wrapper: Wrapper });

    await act(() => result.current.mutateAsync({ repo: "acme/api", action: "files", triggers: ["opened"] }));
    const call = fetchMock.mock.calls[0]!;
    expect(urlOf(call)).toMatch(/\/agents\/ag1\/export-ci$/);
    expect(initOf(call).method).toBe("POST");
    expect(JSON.parse(String(initOf(call).body))).toEqual({ repo: "acme/api", action: "files", triggers: ["opened"] });
    expect(invalidate).not.toHaveBeenCalled();

    await act(() => result.current.mutateAsync({ repo: "acme/api", action: "open_pr", triggers: ["opened"] }));
    expect(invalidatedKeys(invalidate)).toEqual([
      JSON.stringify(["ci-installations", "ag1"]),
      JSON.stringify(["ci-runs"]),
    ]);
  });

  it("useCiRuns passes the limit as a query param", async () => {
    fetchMock.mockImplementation(() => json([]));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useCiRuns(100), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urlOf(fetchMock.mock.calls[0]!)).toMatch(/\/ci-runs\?limit=100$/);
  });

  it("useRefreshCiRuns POSTs /ci-runs/refresh and reloads runs and installations (AC-82)", async () => {
    fetchMock.mockImplementation(() => json({ results: [] }));
    const { Wrapper, invalidate } = wrapper();
    const { result } = renderHook(() => useRefreshCiRuns(), { wrapper: Wrapper });
    await act(() => result.current.mutateAsync());
    const call = fetchMock.mock.calls[0]!;
    expect(urlOf(call)).toMatch(/\/ci-runs\/refresh$/);
    expect(initOf(call).method).toBe("POST");
    expect(invalidatedKeys(invalidate)).toEqual([JSON.stringify(["ci-runs"]), JSON.stringify(["ci-installations"])]);
  });
});
