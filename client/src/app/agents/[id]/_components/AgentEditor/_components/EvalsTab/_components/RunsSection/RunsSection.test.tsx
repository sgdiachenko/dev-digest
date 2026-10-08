import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSuiteRunSummary } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import { RunsSection } from "./RunsSection";

afterEach(cleanup);

function makeRun(i: number, over: Partial<EvalSuiteRunSummary> = {}): EvalSuiteRunSummary {
  return {
    id: `r${i}`,
    agent_id: "a1",
    status: "completed",
    agent_version: i,
    config: { provider: "openai", model: "gpt-4.1", strategy: "single-pass", skills: [], temperature: 0 },
    case_ids: [],
    cases_total: 20,
    cases_completed: 20,
    cases_errored: 0,
    cases_passed: 17,
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    cost_usd: 0.04,
    duration_ms: 1000,
    started_at: `2026-09-${String(10 + i).padStart(2, "0")}T10:00:00Z`,
    finished_at: null,
    error_reason: null,
    ...over,
  };
}

function renderRuns(runs: EvalSuiteRunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <RunsSection agentId="a1" runs={runs} />
    </NextIntlClientProvider>,
  );
}

describe("RunsSection", () => {
  it("lists at most 10 runs, newest first, with every column (AC-96)", () => {
    renderRuns(Array.from({ length: 12 }, (_, i) => makeRun(i + 1)));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(10);
    expect(within(rows[0]!).getByText("v12")).toBeInTheDocument();
    expect(within(rows[9]!).getByText("v3")).toBeInTheDocument();
    for (const col of ["Ran at", "Version", "Recall", "Precision", "Citation accuracy", "Cases passed", "Cost", "Status"]) {
      expect(screen.getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
    expect(within(rows[0]!).getByText("82%")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("17/20")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("$0.04")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Completed")).toBeInTheDocument();
  });

  it("shows a partial run's status and errored cases, and dashes for unknown values (AC-78)", () => {
    renderRuns([makeRun(1, { status: "partial", cases_errored: 2, cost_usd: null, recall: null })]);
    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).getByText(/Partial/)).toHaveTextContent("Partial · 2 cases errored");
    expect(within(row).getByTitle("Cost unknown")).toHaveTextContent("—");
  });

  it("links to the full dashboard for this agent (AC-97)", () => {
    renderRuns([makeRun(1)]);
    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval?agent=a1");
  });

  it("shows the empty text with no runs (AC-178)", () => {
    renderRuns([]);
    expect(screen.getByText("No runs yet — Run all evals")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
