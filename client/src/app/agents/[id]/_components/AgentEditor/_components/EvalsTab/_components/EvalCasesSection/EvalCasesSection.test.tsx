import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase, EvalSuiteRun } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import { EvalCasesSection } from "./EvalCasesSection";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

function makeCase(id: string, over: Partial<EvalCase> = {}): EvalCase {
  return {
    id,
    name: `name-${id}`,
    type: "must_find",
    input_diff: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,2 @@\n x\n+y",
    input_meta: { pr_title: "t", pr_body: null, pr_number: null, repo_full_name: null },
    expectations: [{ file: "a.ts", start_line: 2, end_line: 2, severity: "WARNING", category: "perf", title: "t" }],
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

const last = (status: "pass" | "fail" | "error", expected = 1, actual = 1) => ({
  run_id: "r1",
  status,
  expected_count: expected,
  actual_count: actual,
  ran_at: "2026-10-02T00:00:00Z",
});

function makeRun(over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: "r9",
    agent_id: "a1",
    status: "running",
    agent_version: 1,
    config: { provider: "openai", model: "gpt-4.1", strategy: "single-pass", system_prompt: "p", skills: [], temperature: 0 },
    case_ids: ["c1", "c2", "c3"],
    cases_total: 3,
    cases_completed: 1,
    cases_errored: 0,
    cases_passed: null,
    recall: null,
    precision: null,
    citation_accuracy: null,
    cost_usd: null,
    duration_ms: null,
    started_at: "2026-10-08T00:00:00Z",
    finished_at: null,
    error_reason: null,
    per_case: [],
    ...over,
  };
}

beforeEach(() => fetchMock.mockImplementation(() => json({}, 404)));
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

function renderSection(
  props: { cases?: EvalCase[]; activeRun?: EvalSuiteRun | null; onRunStarted?: (id: string) => void } = {},
) {
  const onRunStarted = props.onRunStarted ?? vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <EvalCasesSection
          agentId="a1"
          agentName="Security Reviewer"
          cases={props.cases ?? [makeCase("c1")]}
          activeRun={props.activeRun ?? null}
          onRunStarted={onRunStarted}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onRunStarted, ...view };
}

const rowOf = (name: string) => screen.getByRole("button", { name: `Open case ${name}` });

describe("EvalCasesSection rows", () => {
  it("renders status icon + text, mono ellipsised name, type tag and expectation badge (AC-60, AC-118, AC-156)", () => {
    renderSection({
      cases: [
        makeCase("c1"),
        makeCase("c2", { type: "must_not_flag", last_result: last("pass", 0, 0) }),
        makeCase("c3", { last_result: last("fail", 1, 0) }),
      ],
    });
    const first = rowOf("name-c1");
    expect(first).toHaveAttribute("title", "name-c1");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(within(first).getByText("name-c1")).toHaveClass("mono");
    expect(within(first).getByText("Never run")).toBeInTheDocument();
    expect(within(first).getByText("must find")).toBeInTheDocument();
    expect(screen.getAllByText("WARNING · perf")).toHaveLength(2);
    expect(within(rowOf("name-c2")).getByText("must not flag")).toBeInTheDocument();
    expect(within(rowOf("name-c2")).getByText("expected 0 findings, got 0")).toBeInTheDocument();
    expect(screen.getByText("empty []")).toBeInTheDocument();
    expect(within(rowOf("name-c3")).getByText("expected 1 finding, got 0")).toBeInTheDocument();
    expect(within(rowOf("name-c3")).getByText("Fail")).toBeInTheDocument();
  });

  it("counts passing cases in the header (AC-61)", () => {
    renderSection({
      cases: [makeCase("c1", { last_result: last("pass") }), makeCase("c2", { last_result: last("pass") }), makeCase("c3", { last_result: last("fail") })],
    });
    expect(screen.getByText("2 / 3 passing")).toBeInTheDocument();
    expect(screen.getByText("3 cases")).toBeInTheDocument();
  });

  it("links a case created from a finding to its PR (AC-69)", () => {
    renderSection({
      cases: [makeCase("c1", { source: { finding_title: "Hardcoded key", pr_number: 7, repo_id: "r-1", triage: "accepted" } })],
    });
    expect(screen.getByText("From finding ‘Hardcoded key’ · PR #7 · accepted")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View PR #7" })).toHaveAttribute("href", "/repos/r-1/pulls/7");
  });

  it("shows the empty text and a disabled Run all evals with the reason (AC-68, AC-81, EC-13)", () => {
    renderSection({ cases: [] });
    expect(screen.getByText(/No eval cases yet/)).toBeInTheDocument();
    const runAll = screen.getByRole("button", { name: "Run all evals" });
    expect(runAll).toBeDisabled();
    expect(runAll).toHaveAccessibleDescription("Add a case first");
  });

  it("shows run actions only on hover or focus-within, as labelled buttons (AC-174)", () => {
    renderSection();
    const run = screen.getByRole("button", { name: "Run case name-c1" });
    expect(screen.getByRole("button", { name: "Edit case name-c1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete case name-c1" })).toBeInTheDocument();
    const actions = run.parentElement!;
    expect(getComputedStyle(actions).opacity).toBe("0");
    fireEvent.focus(run);
    expect(getComputedStyle(actions).opacity).toBe("1");
    fireEvent.blur(run);
    expect(getComputedStyle(actions).opacity).toBe("0");
    fireEvent.mouseEnter(actions);
    expect(getComputedStyle(actions).opacity).toBe("1");
  });
});

describe("EvalCasesSection open / new / delete", () => {
  it("opens the case modal on click, Enter and Space (AC-62, AC-173)", () => {
    renderSection();
    fireEvent.click(rowOf("name-c1"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Eval case · name-c1");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(rowOf("name-c1"), { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(rowOf("name-c1"), { key: " " });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens an empty modal from New eval case (AC-71)", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("New eval case");
  });

  it("confirms a delete naming the case, keeps focus inside, then deletes (AC-64, NFR-9, AC-136)", async () => {
    fetchMock.mockImplementation(() => json({ ok: true }));
    renderSection();
    const trigger = screen.getByRole("button", { name: "Delete case name-c1" });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete name-c1? Its per-case history is removed; recorded run metrics stay.");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete case" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(call?.[0]).toMatch(/\/eval-cases\/c1$/);
  });

  it("closes the delete dialog with Escape and returns focus to the trigger (NFR-9)", async () => {
    renderSection();
    const trigger = screen.getByRole("button", { name: "Delete case name-c1" });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
  });
});

describe("EvalCasesSection running", () => {
  it("shows the attempt result in the row after Run (AC-67)", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/eval-cases/c1/attempts")) return json({ attempt_id: "t1" }, 202);
      if (url.endsWith("/eval-attempts/t1")) {
        return json({
          attempt_id: "t1",
          status: "done",
          started_at: "2026-10-08T00:00:00Z",
          result: {
            case_id: "c1",
            case_name: "name-c1",
            status: "fail",
            error_reason: null,
            actual_findings: [],
            dropped_findings: [],
            expected_count: 1,
            actual_count: 0,
            duration_ms: 10,
            cost_usd: null,
          },
        });
      }
      return json({}, 404);
    });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Run case name-c1" }));
    expect(await within(rowOf("name-c1")).findByText("Fail")).toBeInTheDocument();
    expect(within(rowOf("name-c1")).getByText("expected 1 finding, got 0")).toBeInTheDocument();
  });

  it("shows queued / running / recorded statuses and disables Run all during a run (AC-85, AC-152)", () => {
    renderSection({
      cases: [makeCase("c1"), makeCase("c2"), makeCase("c3")],
      activeRun: makeRun({
        per_case: [
          { case_id: "c1", case_name: "name-c1", status: "pass", error_reason: null, actual_findings: [], dropped_findings: [], expected_count: 1, actual_count: 1, duration_ms: 1, cost_usd: null },
        ],
      }),
    });
    expect(within(rowOf("name-c1")).getByText("Pass")).toBeInTheDocument();
    expect(within(rowOf("name-c2")).getByText("Running")).toBeInTheDocument();
    expect(within(rowOf("name-c3")).getByText("Queued")).toBeInTheDocument();
    const runAll = screen.getByRole("button", { name: "Run all evals" });
    expect(runAll).toBeDisabled();
    expect(runAll).toHaveAccessibleDescription("A run is already in progress");
  });

  it("joins the active run when the server answers 409 (AC-83, EC-14)", async () => {
    fetchMock.mockImplementation(() =>
      json({ error: { code: "run_active", message: "active", details: { active_run_id: "r-active" } } }, 409),
    );
    const { onRunStarted } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    await waitFor(() => expect(onRunStarted).toHaveBeenCalledWith("r-active"));
  });
});
