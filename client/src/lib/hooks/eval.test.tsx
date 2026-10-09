import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type Query } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useEvalRun,
  useEvalAttempt,
  useStartEvalRun,
  useStartAllEvalRuns,
  useCreateEvalCase,
  useUpdateEvalCase,
  useDeleteEvalCase,
} from "./eval";

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

function intervalOf(qc: QueryClient, key: unknown[]): number | false | undefined {
  const query = qc.getQueryCache().find({ queryKey: key })!;
  const opt = query.observers[0]!.options.refetchInterval;
  return typeof opt === "function" ? opt(query as Query) : opt;
}

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

describe("eval hooks polling", () => {
  it.each([
    ["queued", 2000],
    ["running", 2000],
    ["completed", false],
  ] as const)("useEvalRun with status %s polls %s", async (status, expected) => {
    fetchMock.mockImplementation(() => json({ id: "r1", status }));
    const { qc, Wrapper } = wrapper();
    const { result } = renderHook(() => useEvalRun("r1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(intervalOf(qc, ["eval-run", "r1"])).toBe(expected);
  });

  it.each([
    ["running", 1000],
    ["done", false],
  ] as const)("useEvalAttempt with status %s polls %s", async (status, expected) => {
    fetchMock.mockImplementation(() => json({ attempt_id: "a1", status, result: null }));
    const { qc, Wrapper } = wrapper();
    const { result } = renderHook(() => useEvalAttempt("a1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(intervalOf(qc, ["eval-attempt", "a1"])).toBe(expected);
  });
});

describe("useStartEvalRun", () => {
  it("returns the active run id on 409 run_active (AC-83)", async () => {
    fetchMock.mockImplementation(() =>
      json({ error: { code: "run_active", message: "active", details: { active_run_id: "r-active" } } }, 409),
    );
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useStartEvalRun("ag1"), { wrapper: Wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync();
    });
    expect(res).toEqual({ run_id: "r-active", already_active: true });
  });

  it("rejects other errors and returns the new run id on 202", async () => {
    fetchMock.mockImplementationOnce(() => json({ error: { code: "no_cases", message: "none" } }, 422));
    fetchMock.mockImplementationOnce(() => json({ run_id: "r2" }, 202));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useStartEvalRun("ag1"), { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toMatchObject({ code: "no_cases" });
    });
    await act(async () => {
      expect(await result.current.mutateAsync()).toEqual({ run_id: "r2", already_active: false });
    });
  });
});

describe("case mutations invalidate eval queries (AC-136)", () => {
  type Case = [string, () => Mutation, (m: Mutation) => Promise<unknown>];
  type Mutation = { mutateAsync: (v: never) => Promise<unknown> };
  it.each<Case>([
    ["create", () => useCreateEvalCase("ag1"), (m) => m.mutateAsync({} as never)],
    ["update", () => useUpdateEvalCase("ag1"), (m) => m.mutateAsync({ caseId: "c1", input: {} } as never)],
    ["delete", () => useDeleteEvalCase("ag1"), (m) => m.mutateAsync("c1" as never)],
  ])("%s", async (_n, useHook, run) => {
    fetchMock.mockImplementation(() => json({ ok: true }));
    const { qc, Wrapper } = wrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useHook(), { wrapper: Wrapper });
    await act(async () => {
      await run(result.current);
    });
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(["eval-cases", "ag1"]),
        JSON.stringify(["eval-runs", "ag1"]),
        JSON.stringify(["eval-overview"]),
      ]),
    );
  });
});

describe("useStartAllEvalRuns", () => {
  it("POSTs /eval/run-all and resolves run_ids; a 409 resolves with an empty list", async () => {
    const { Wrapper } = wrapper();
    fetchMock.mockImplementationOnce(() => json({ run_ids: ["r1"] }, 202));
    const { result } = renderHook(() => useStartAllEvalRuns(), { wrapper: Wrapper });
    let first: unknown;
    await act(async () => {
      first = await result.current.mutateAsync();
    });
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/eval/run-all");
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST" });
    expect(first).toEqual({ run_ids: ["r1"] });

    fetchMock.mockImplementationOnce(() => json({ error: "run_active" }, 409));
    let second: unknown;
    await act(async () => {
      second = await result.current.mutateAsync();
    });
    expect(second).toEqual({ run_ids: [] });
  });
});
