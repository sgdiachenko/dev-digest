import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import results from "../../../../../../../../messages/en/multiAgentResults.json";
import { AgentSummaryCard } from "./AgentSummaryCard";

const column = {
  run_id: "r1",
  agent_id: "a1",
  agent_name: "Security",
  provider: null,
  model: null,
  status: "done",
  error: null,
  verdict: "request_changes",
  score: 38,
  summary: "Two critical exposures.",
  duration_ms: 8200,
  cost_usd: 0.06,
  findings: [],
} as unknown as AgentColumn;

afterEach(cleanup);

describe("AgentSummaryCard", () => {
  it("shows name, score, summary and run meta, and opens the trace", () => {
    const onOpenTrace = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results }}>
        <AgentSummaryCard column={column} onOpenTrace={onOpenTrace} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Security" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Score 38" })).toBeTruthy();
    expect(screen.getByText("Two critical exposures.")).toBeTruthy();
    expect(screen.getByText("8s · $0.060")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View trace" }));
    expect(onOpenTrace).toHaveBeenCalledWith("r1");
  });

  it("falls back to the verdict when there is no summary", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results }}>
        <AgentSummaryCard column={{ ...column, summary: null }} onOpenTrace={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("request_changes")).toBeTruthy();
  });
});
