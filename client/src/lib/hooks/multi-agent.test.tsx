import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { MultiAgentRun } from "@devdigest/shared";
import { multiAgentPollInterval, useMultiAgentRun, useStartMultiAgentReview } from "./multi-agent";
import { useFindingAction } from "./reviews";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

function run(statuses: Array<MultiAgentRun["columns"][number]["status"]>): MultiAgentRun {
  return {
    id: "g1",
    pr_id: "pr1",
    ran_at: "2026-10-09T00:00:00Z",
    agent_count: statuses.length,
    total_duration_ms: 0,
    total_cost_usd: null,
    columns: statuses.map((status, i) => ({
      run_id: `r${i}`,
      agent_id: `a${i}`,
      agent_name: `Agent ${i}`,
      provider: null,
      model: null,
      status,
      error: null,
      verdict: null,
      score: null,
      summary: null,
      duration_ms: null,
      cost_usd: null,
      findings: [],
    })),
    finding_groups: [],
    conflicts: [],
  };
}

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

describe("multiAgentPollInterval", () => {
  it("polls every 3500ms while any column is running, otherwise stops", () => {
    expect(multiAgentPollInterval(run(["done", "running"]))).toBe(3500);
    expect(multiAgentPollInterval(run(["done", "failed", "cancelled"]))).toBe(false);
    expect(multiAgentPollInterval(null)).toBe(false);
    expect(multiAgentPollInterval(undefined)).toBe(false);
  });
});

describe("useStartMultiAgentReview", () => {
  it("POSTs exactly { agent_ids } and invalidates the PR's run caches", async () => {
    fetchMock.mockImplementation(() =>
      json({ pr_id: "pr1", runs: [], reviews: [], multi_agent_run_id: "g1" }),
    );
    const { qc, Wrapper } = wrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useStartMultiAgentReview(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ prId: "pr1", agentIds: ["a1", "a2"] });
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/pulls\/pr1\/review$/);
    expect(JSON.parse(init.body)).toEqual({ agent_ids: ["a1", "a2"] });
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ["multi-agent", "pr1"],
        ["reviews", "pr1"],
        ["pr-active-runs", "pr1"],
        ["pr-runs", "pr1"],
      ]),
    );
  });
});

describe("useFindingAction", () => {
  it("also invalidates the multi-agent group for the PR", async () => {
    fetchMock.mockImplementation(() => json({ finding: {} }));
    const { qc, Wrapper } = wrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useFindingAction(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ findingId: "f1", action: "accept", prId: "pr1" });
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ["reviews", "pr1"],
        ["multi-agent", "pr1"],
      ]),
    );
  });
});

describe("useMultiAgentRun", () => {
  it("invalidates the PR's reviews once when the last running column finishes", async () => {
    let body: MultiAgentRun = run(["done", "running"]);
    fetchMock.mockImplementation(() => json(body));
    const { qc, Wrapper } = wrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useMultiAgentRun("pr1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.columns[1]?.status).toBe("running"));
    expect(spy).not.toHaveBeenCalled();

    body = run(["done", "done"]);
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["multi-agent", "pr1"] });
    });
    await waitFor(() => expect(result.current.data?.columns[1]?.status).toBe("done"));
    const reviewCalls = () =>
      spy.mock.calls.filter((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey) === '["reviews","pr1"]');
    await waitFor(() => expect(reviewCalls()).toHaveLength(1));

    await act(async () => {
      await qc.refetchQueries({ queryKey: ["multi-agent", "pr1"] });
    });
    expect(reviewCalls()).toHaveLength(1);
  });
});
