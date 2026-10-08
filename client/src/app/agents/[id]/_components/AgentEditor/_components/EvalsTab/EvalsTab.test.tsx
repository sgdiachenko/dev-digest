import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase, EvalSuiteRun, EvalSuiteRunSummary } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import { EvalsTab } from "./EvalsTab";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

function makeCase(i: number, over: Partial<EvalCase> = {}): EvalCase {
  return {
    id: `c${i}`,
    name: `case-${i}`,
    type: "must_find",
    input_diff: "diff",
    input_meta: { pr_title: "t", pr_body: null, pr_number: null, repo_full_name: null },
    expectations: [{ file: "a.ts", start_line: 1, end_line: 2, severity: "WARNING", category: "perf", title: null }],
    source_finding_id: null,
    diff_source: "manual",
    notes: null,
    owner_kind: "agent",
    owner_id: "a1",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    last_result: null,
    source: null,
    ...over,
  };
}

function makeRun(id: string, startedAt: string, over: Partial<EvalSuiteRunSummary> = {}): EvalSuiteRunSummary {
  return {
    id,
    agent_id: "a1",
    status: "completed",
    agent_version: 1,
    config: { provider: "openai", model: "gpt-4.1", strategy: "single-pass", skills: [], temperature: 0 },
    case_ids: ["c1"],
    cases_total: 20,
    cases_completed: 20,
    cases_errored: 0,
    cases_passed: 17,
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    cost_usd: 0.04,
    duration_ms: 1000,
    started_at: startedAt,
    finished_at: startedAt,
    error_reason: null,
    ...over,
  };
}

interface Api {
  cases: EvalCase[] | number;
  runs: EvalSuiteRunSummary[];
  run?: Partial<EvalSuiteRun>;
  startRun?: () => Promise<Response>;
}
let api: Api;

beforeEach(() => {
  api = { cases: [makeCase(1), makeCase(2), makeCase(3)], runs: [] };
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.endsWith("/agents/a1/eval-cases")) {
      return typeof api.cases === "number" ? json({ error: { code: "x", message: "boom" } }, api.cases) : json(api.cases);
    }
    if (url.endsWith("/agents/a1/eval-runs") && method === "POST") return api.startRun!();
    if (url.endsWith("/agents/a1/eval-runs")) return json(api.runs);
    if (url.includes("/eval-runs/")) return json({ ...makeRun("r9", "2026-10-08T00:00:00Z"), per_case: [], ...api.run });
    return json({}, 404);
  });
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <EvalsTab agentId="a1" agentName="Security Reviewer" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { qc, ...view };
}

const tile = (name: string) => screen.getByRole("group", { name });

describe("EvalsTab metrics", () => {
  it("shows the latest finished run with its change against the one before (AC-93, AC-175)", async () => {
    api.runs = [
      makeRun("r3", "2026-10-03T00:00:00Z", { status: "running", recall: null }),
      makeRun("r2", "2026-10-02T00:00:00Z", { status: "partial", recall: 0.82, precision: 0.91, citation_accuracy: 0.95, cases_passed: 17, cases_total: 20 }),
      makeRun("r1", "2026-10-01T00:00:00Z", { recall: 0.77, precision: 0.93, citation_accuracy: 0.95 }),
    ];
    renderTab();
    await waitFor(() => expect(within(tile("Recall")).getByText("82%")).toBeInTheDocument());
    expect(within(tile("Recall")).getByText("▲ 5 pts")).toBeInTheDocument();
    expect(within(tile("Precision")).getByText("▼ 2 pts")).toBeInTheDocument();
    expect(within(tile("Citation accuracy")).getByText("no change")).toBeInTheDocument();
    expect(within(tile("Cases passed")).getByText("17/20")).toBeInTheDocument();
  });

  it("shows no change with a single run (AC-176) and dashes with no runs (AC-177)", async () => {
    api.runs = [makeRun("r1", "2026-10-01T00:00:00Z")];
    const first = renderTab();
    await waitFor(() => expect(within(tile("Recall")).getByText("82%")).toBeInTheDocument());
    expect(screen.queryByText(/pts$/)).not.toBeInTheDocument();
    expect(screen.queryByText("no change")).not.toBeInTheDocument();
    first.unmount();

    api.runs = [];
    renderTab();
    await waitFor(() => expect(screen.getByText("Eval cases")).toBeInTheDocument());
    for (const name of ["Recall", "Precision", "Citation accuracy", "Cases passed"]) {
      expect(within(tile(name)).getByText("—")).toBeInTheDocument();
    }
  });

  it("explains a null metric with a tooltip reason (AC-99)", async () => {
    api.runs = [makeRun("r1", "2026-10-01T00:00:00Z", { recall: null, precision: null })];
    renderTab();
    await waitFor(() => expect(within(tile("Recall")).getByTitle("no must-find cases")).toHaveTextContent("—"));
    expect(within(tile("Precision")).getByTitle("no findings")).toHaveTextContent("—");
    expect(within(tile("Citation accuracy")).getByText("95%")).toBeInTheDocument();
  });

  it("shows both notes and the small-set hint for 3 cases (AC-95, AC-70, EC-32)", async () => {
    renderTab();
    expect(await screen.findByText(/one model call per case/)).toBeInTheDocument();
    expect(screen.getByText(/Scoring is mechanical/)).toBeInTheDocument();
    expect(screen.getByText("Small or one-sided set — metrics are noisy")).toBeInTheDocument();
  });
});

describe("EvalsTab states", () => {
  it("shows a skeleton while loading (AC-116)", () => {
    renderTab();
    expect(screen.getByLabelText("Loading…")).toHaveAttribute("aria-busy", "true");
  });

  it("shows an error with Retry, then recovers (AC-179)", async () => {
    api.cases = 500;
    renderTab();
    expect(await screen.findByText("Couldn’t load eval data")).toBeInTheDocument();
    api.cases = [makeCase(1)];
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("case-1")).toBeInTheDocument();
  });

  it("keeps the data when a refetch fails (AC-180)", async () => {
    const { qc } = renderTab();
    expect(await screen.findByText("case-1")).toBeInTheDocument();
    api.cases = 500;
    await qc.invalidateQueries({ queryKey: ["eval-cases", "a1"] });
    expect(await screen.findByRole("alert")).toHaveTextContent("Data already shown is kept");
    expect(screen.getByText("case-1")).toBeInTheDocument();
  });
});

describe("EvalsTab suite run", () => {
  it("shows k / N cases for a run already in flight (AC-151)", async () => {
    api.runs = [makeRun("r9", "2026-10-08T00:00:00Z", { status: "running" })];
    api.run = { status: "running", cases_total: 5, cases_completed: 2, case_ids: ["c1", "c2", "c3"], per_case: [] };
    renderTab();
    expect(await screen.findByText("2 / 5 cases")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 / 5 cases");
  });

  it("announces the final status and metrics without moving focus (AC-86, NFR-11)", async () => {
    api.startRun = () => json({ run_id: "r9" }, 202);
    api.run = { status: "completed", recall: 0.5, precision: null, citation_accuracy: 1 };
    renderTab();
    const runAll = await screen.findByRole("button", { name: "Run all evals" });
    runAll.focus();
    fireEvent.click(runAll);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Run finished: Completed. Recall 50%, precision —, citation accuracy 100%.",
      ),
    );
    expect(document.activeElement).toBe(runAll);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
