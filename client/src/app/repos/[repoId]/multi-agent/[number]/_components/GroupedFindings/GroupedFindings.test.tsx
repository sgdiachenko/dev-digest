import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn, FindingGroup } from "@devdigest/shared";
import results from "../../../../../../../../messages/en/multiAgentResults.json";
import { GroupedFindings } from "./GroupedFindings";

const finding = (id: string, title: string) => ({
  id,
  severity: "WARNING" as const,
  category: "bug",
  title,
  file: "a.ts",
  start_line: 4,
  end_line: 6,
});
const col = (run_id: string, name: string | null, findings: AgentColumn["findings"]): AgentColumn => ({
  run_id,
  agent_id: name ? `a-${run_id}` : null,
  agent_name: name,
  provider: null,
  model: null,
  status: "done",
  error: null,
  verdict: null,
  score: null,
  summary: null,
  duration_ms: null,
  cost_usd: null,
  findings,
});

const columns = [
  col("r1", "Security", [finding("f1", "SQL injection")]),
  col("r2", null, [finding("f2", "Unsafe query"), finding("f3", "Lonely")]),
];
const groups: FindingGroup[] = [
  { id: "f1", file: "a.ts", start_line: 4, end_line: 6, finding_ids: ["f1", "f2"], run_ids: ["r1", "r2"] },
  { id: "f3", file: "b.ts", start_line: 1, end_line: 1, finding_ids: ["f3"], run_ids: ["r2"] },
];

afterEach(cleanup);

describe("GroupedFindings", () => {
  it("lists each agent and title of a 2+ group, skips single-finding groups, and opens the original", () => {
    const onOpen = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results }}>
        <GroupedFindings groups={groups} columns={columns} onOpenFinding={onOpen} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("a.ts:4-6")).toBeTruthy();
    expect(screen.queryByText("Lonely")).toBeNull();
    expect(screen.getByText("Deleted agent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Deleted agent.*Unsafe query/ }));
    expect(onOpen).toHaveBeenCalledWith("r2", "f2");
    fireEvent.click(screen.getByRole("button", { name: /Security.*SQL injection/ }));
    expect(onOpen).toHaveBeenCalledWith("r1", "f1");
  });

  it("shows an empty text when no group has 2+ findings", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results }}>
        <GroupedFindings groups={[groups[1]!]} columns={columns} onOpenFinding={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("No finding was reported by more than one agent.")).toBeTruthy();
  });
});
