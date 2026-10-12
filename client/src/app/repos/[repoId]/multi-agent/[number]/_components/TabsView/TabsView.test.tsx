import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn, ReviewRecord } from "@devdigest/shared";
import results from "../../../../../../../../messages/en/multiAgentResults.json";
import common from "../../../../../../../../messages/en/common.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

const mutate = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({ useFindingAction: () => ({ mutate, isPending: false }) }));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: [{ id: "a1", name: "Security" }] }) }));

import { TabsView } from "./TabsView";

const col = (run_id: string, name: string): AgentColumn => ({
  run_id,
  agent_id: "a1",
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
  findings: [],
});
const finding = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  review_id: "rev1",
  severity: "WARNING",
  category: "bug",
  title,
  file: "a.ts",
  start_line: 1,
  end_line: 2,
  rationale: "because",
  suggestion: "use a prepared statement",
  confidence: 0.9,
  accepted_at: null,
  dismissed_at: null,
  ...over,
});
const reviews = [
  { id: "rev1", run_id: "r1", agent_id: "a1", findings: [finding("f1", "SQL injection"), finding("f2", "Other")] },
  { id: "rev2", run_id: "r2", agent_id: "a1", findings: [finding("f3", "Second agent finding")] },
] as unknown as ReviewRecord[];

const onOpenTrace = vi.fn();
const view = (selectedRunId: string, focusedFindingId: string | null = "f1") =>
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results, common, prReview }}>
      <TabsView
        columns={[col("r1", "Security"), col("r2", "Style")]}
        reviews={reviews}
        selectedRunId={selectedRunId}
        prId="pr1"
        focusedFindingId={focusedFindingId}
        repoFullName={null}
        onSelectAgent={vi.fn()}
        onOpenTrace={onOpenTrace}
      />
    </NextIntlClientProvider>,
  );

afterEach(() => {
  cleanup();
  mutate.mockReset();
  onOpenTrace.mockReset();
});

describe("TabsView", () => {
  it("shows only the selected run's cards with their actions, and Accept sends prId", () => {
    view("r1");
    expect(screen.getByText("SQL injection")).toBeTruthy();
    expect(screen.queryByText("Second agent finding")).toBeNull();
    expect(screen.getAllByTitle("Model confidence")[0]).toBeTruthy();
    expect(screen.getByText("use a prepared statement")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });

  it("renders Learn as a disabled 'coming soon' stub and offers no Reply control", () => {
    view("r1");
    const learn = screen.getAllByRole("button", { name: "Learn" });
    expect(learn).toHaveLength(1);
    expect((learn[0] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("coming soon")).toHaveLength(1);
    expect(screen.queryByText(/reply/i)).toBeNull();
  });

  it("renders non-focused findings collapsed and expands them on click", () => {
    view("r1");
    const [focusedHeader, otherHeader] = screen.getAllByRole("button", { expanded: undefined }).filter((b) => b.hasAttribute("aria-expanded"));
    expect(focusedHeader!.getAttribute("aria-expanded")).toBe("true");
    expect(otherHeader!.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(1);
    fireEvent.click(otherHeader!);
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(2);
  });

  it("shows the selected agent's summary card and opens its trace", () => {
    view("r1");
    fireEvent.click(screen.getByRole("button", { name: "View trace" }));
    expect(onOpenTrace).toHaveBeenCalledWith("r1");
  });

  it("shows another agent's findings after the selection changes", () => {
    view("r2", null);
    expect(screen.getByText("Second agent finding")).toBeTruthy();
    expect(screen.queryByText("SQL injection")).toBeNull();
  });
});
