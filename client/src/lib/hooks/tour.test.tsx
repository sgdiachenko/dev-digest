import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type Query } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Onboarding } from "../types";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../api", () => ({ api: { get: h.get, post: vi.fn() } }));

import { useRepoTour } from "./tour";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

/** Resolves the observer's `refetchInterval` against the query's current data. */
function intervalOf(qc: QueryClient, repoId: string): number | false | undefined {
  const query = qc.getQueryCache().find({ queryKey: ["repo-tour", repoId] })!;
  const opt = query.observers[0]!.options.refetchInterval;
  return typeof opt === "function" ? opt(query as Query) : opt;
}

const tourWith = (status: "generating" | "ready" | null) =>
  ({ repo_id: "r1", narrative: status ? { status } : null }) as unknown as Onboarding;

afterEach(() => {
  cleanup();
  h.get.mockReset();
});

describe("useRepoTour polling", () => {
  it("polls every 1500 ms while the narrative is generating", async () => {
    h.get.mockResolvedValue(tourWith("generating"));
    const { qc, Wrapper } = wrapper();
    const { result } = renderHook(() => useRepoTour("r1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(intervalOf(qc, "r1")).toBe(1500);
  });

  it.each([["ready" as const], [null]])("does not poll when the narrative is %s", async (status) => {
    h.get.mockResolvedValue(tourWith(status));
    const { qc, Wrapper } = wrapper();
    const { result } = renderHook(() => useRepoTour("r1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(intervalOf(qc, "r1")).toBe(false);
  });

  it("does not poll before any data has loaded", () => {
    h.get.mockReturnValue(new Promise(() => {}));
    const { qc, Wrapper } = wrapper();
    renderHook(() => useRepoTour("r1"), { wrapper: Wrapper });
    expect(intervalOf(qc, "r1")).toBe(false);
  });
});
