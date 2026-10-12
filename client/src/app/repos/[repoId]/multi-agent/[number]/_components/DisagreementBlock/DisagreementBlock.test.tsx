import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn, Conflict } from "@devdigest/shared";
import results from "../../../../../../../../messages/en/multiAgentResults.json";
import common from "../../../../../../../../messages/en/common.json";
import { DisagreementBlock } from "./DisagreementBlock";

const col = (run_id: string, name: string | null, status: AgentColumn["status"] = "done"): AgentColumn => ({
  run_id,
  agent_id: name ? `a-${run_id}` : null,
  agent_name: name,
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
});
const columns = [col("r1", "Security"), col("r2", null), col("r3", "Style", "failed")];

const conflicts: Conflict[] = [
  {
    group_id: "g1",
    file: "a.ts",
    line: 4,
    end_line: 6,
    title: "SQL injection",
    is_conflict: true,
    takes: [
      { run_id: "r1", agent_id: "a-r1", persona: "Security", verdict: "CRITICAL", note: "" },
      { run_id: "r2", agent_id: null, persona: "Old", verdict: "ignored", note: "" },
      { run_id: "r3", agent_id: "a-r3", persona: "Style", verdict: "no_result", note: "" },
    ],
  },
  {
    group_id: "g2",
    file: "b.ts",
    line: 1,
    end_line: 1,
    title: "Typo",
    is_conflict: false,
    takes: [{ run_id: "r1", agent_id: "a-r1", persona: "Security", verdict: "SUGGESTION", note: "" }],
  },
];

const view = (c: Conflict[]) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results, common }}>
      <DisagreementBlock conflicts={c} columns={columns} />
    </NextIntlClientProvider>,
  );

afterEach(cleanup);

describe("DisagreementBlock", () => {
  it("shows a cell per take and filters with the pressed toggle", () => {
    view(conflicts);
    expect(screen.getByText("did not flag")).toBeTruthy();
    expect(screen.getByText("no result")).toBeTruthy();
    expect(screen.getByText("Deleted agent")).toBeTruthy();
    expect(screen.getByText("Typo")).toBeTruthy();

    const toggle = screen.getByRole("button", { name: "Show only conflicts" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Typo")).toBeNull();
    expect(screen.getByText("SQL injection")).toBeTruthy();
  });

  it("uses different texts for 'all agree' and 'no findings'", () => {
    view([conflicts[1]!]);
    fireEvent.click(screen.getByRole("button", { name: "Show only conflicts" }));
    expect(screen.getByText("All agents agree")).toBeTruthy();
    cleanup();

    view([]);
    expect(screen.queryByText("All agents agree")).toBeNull();
    expect(screen.getByText(/nothing to compare/)).toBeTruthy();
  });
});
