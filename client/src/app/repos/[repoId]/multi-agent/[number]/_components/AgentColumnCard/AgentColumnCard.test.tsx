import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import results from "../../../../../../../../messages/en/multiAgentResults.json";
import common from "../../../../../../../../messages/en/common.json";
import { AgentColumnCard } from "./AgentColumnCard";

const column = (over: Partial<AgentColumn> = {}): AgentColumn => ({
  run_id: "r1",
  agent_id: "a1",
  agent_name: "Security",
  provider: null,
  model: null,
  status: "done",
  error: null,
  verdict: null,
  score: null,
  summary: null,
  duration_ms: 6000,
  cost_usd: 0.014,
  findings: [],
  ...over,
});

function renderCard(c: AgentColumn, onOpenTrace = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results, common }}>
      <AgentColumnCard column={c} onOpenTrace={onOpenTrace} />
    </NextIntlClientProvider>,
  );
  return onOpenTrace;
}

afterEach(cleanup);

describe("AgentColumnCard", () => {
  it("shows each status as text with an icon", () => {
    for (const [status, text] of [
      ["running", "Running"],
      ["done", "Done"],
      ["failed", "Failed"],
      ["cancelled", "Cancelled"],
    ] as const) {
      renderCard(column({ status }));
      const label = screen.getByText(text);
      expect(label.querySelector("svg")).not.toBeNull();
      cleanup();
    }
  });

  it("shows a failed column's error, an empty done column, and opens the trace", () => {
    const onOpenTrace = renderCard(column({ status: "failed", error: "provider exploded" }));
    expect(screen.getByText("provider exploded")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View trace" }));
    expect(onOpenTrace).toHaveBeenCalledWith("r1");
    cleanup();

    renderCard(column());
    expect(screen.getByText("No findings")).toBeTruthy();
  });

  it("labels a deleted agent and truncates long finding titles with an expand control", () => {
    const long = "T".repeat(300);
    renderCard(
      column({
        agent_id: null,
        agent_name: null,
        findings: [{ id: "f1", severity: "WARNING", category: "bug", title: long, file: "a.ts", start_line: 3, end_line: 9 }],
      }),
    );
    expect(screen.getAllByText("Deleted agent").length).toBeGreaterThan(0);
    expect(screen.getByText("a.ts:3-9")).toBeTruthy();
    const expandButtons = screen.getAllByRole("button", { name: "Show full text" });
    fireEvent.click(expandButtons[1]!);
    expect(expandButtons[1]!.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(long)).toBeTruthy();
  });

  it("shows time · cost, the score ring, the finding count and a severity label per finding", () => {
    renderCard(
      column({
        score: 38,
        duration_ms: 8200,
        cost_usd: 0.06,
        findings: [
          { id: "f1", severity: "CRITICAL", category: "bug", title: "Leaked key", file: "a.ts", start_line: 1, end_line: null },
          { id: "f2", severity: "WARNING", category: "bug", title: "Missing header", file: "b.ts", start_line: 2, end_line: null },
        ],
      }),
    );
    expect(screen.getByText("38")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Score 38" })).toBeTruthy();
    expect(screen.getByText("2 findings")).toBeTruthy();
    expect(screen.getByText("8s · $0.060")).toBeTruthy();
    expect(screen.getByLabelText("CRITICAL")).toBeTruthy();
    expect(screen.getByLabelText("WARNING")).toBeTruthy();
    expect(screen.getByText("a.ts:1")).toBeTruthy();
  });
});
