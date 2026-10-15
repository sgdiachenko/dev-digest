import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRunTrace } from "./trace";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function wrapper() {
  const qc = new QueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

describe("useRunTrace", () => {
  it("encodes the run id, so a run id taken from the URL cannot steer the request to another path", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } })),
    );
    renderHook(() => useRunTrace("../../settings/x?y=1#z"), { wrapper: wrapper() });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe("/runs/..%2F..%2Fsettings%2Fx%3Fy%3D1%23z/trace");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });

  it("does not request anything without a run id", () => {
    renderHook(() => useRunTrace(null), { wrapper: wrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
