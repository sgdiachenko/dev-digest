import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../api", () => ({ api: { get: h.get, post: vi.fn() } }));

import { useRepoIntelStatus } from "./repo-intel";

function intervalFor(poll: boolean | undefined) {
  h.get.mockResolvedValue({ status: "full" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useRepoIntelStatus("r1", poll), { wrapper: Wrapper });
  return waitFor(() => expect(result.current.isSuccess).toBe(true)).then(
    () => qc.getQueryCache().find({ queryKey: ["repo-intel-state", "r1"] })!.observers[0]!.options.refetchInterval,
  );
}

afterEach(() => {
  cleanup();
  h.get.mockReset();
});

describe("useRepoIntelStatus polling", () => {
  it("refetches every 1500 ms when polling is on", async () => {
    expect(await intervalFor(true)).toBe(1500);
  });

  it("does not poll by default or when polling is off", async () => {
    expect(await intervalFor(undefined)).toBe(false);
    expect(await intervalFor(false)).toBe(false);
  });
});
