import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn, MultiAgentRun } from "@devdigest/shared";
import results from "../../../../../../../../messages/en/multiAgentResults.json";
import common from "../../../../../../../../messages/en/common.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: { full_name: "o/r" } }) }));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: [] }) }));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [] }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

const group: { data: MultiAgentRun | null | undefined; isPending: boolean; isError: boolean } = {
  data: undefined,
  isPending: false,
  isError: false,
};
vi.mock("@/lib/hooks/multi-agent", () => ({ useMultiAgentRun: () => group }));

const drawer = vi.fn();
vi.mock("@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer", () => ({
  default: (props: Record<string, unknown>) => {
    drawer(props);
    return <div data-testid="drawer" />;
  },
}));

import { MultiAgentResults } from "./MultiAgentResults";

const col = (run_id: string, name: string, status: AgentColumn["status"], error: string | null = null): AgentColumn => ({
  run_id,
  agent_id: `a-${run_id}`,
  agent_name: name,
  provider: null,
  model: null,
  status,
  error,
  verdict: null,
  score: null,
  summary: null,
  duration_ms: 5000,
  cost_usd: 0.01,
  findings: [],
});
const run = (columns: AgentColumn[]): MultiAgentRun => ({
  id: "g1",
  pr_id: "pr1",
  pr_number: 482,
  ran_at: "2026-10-09T00:00:00Z",
  agent_count: columns.length,
  total_duration_ms: 5000,
  total_cost_usd: 0.02,
  columns,
  finding_groups: [],
  conflicts: [],
});

const mount = (prId: string | null = "pr1") => (
  <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results, common, prReview }}>
    <MultiAgentResults repoId="r" number="482" prId={prId} pullsLoading={false} />
  </NextIntlClientProvider>
);

beforeEach(() => {
  search = "";
  group.data = run([col("r1", "Security", "done"), col("r2", "Style", "running")]);
  group.isPending = false;
  group.isError = false;
});
afterEach(() => {
  cleanup();
  replace.mockReset();
  drawer.mockReset();
});

describe("MultiAgentResults", () => {
  it("shows the empty state with a Configure link when the PR has no group", () => {
    group.data = null;
    render(mount());
    expect(screen.getByText("No multi-agent run yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Configure a multi-agent run" }).getAttribute("href")).toBe(
      "/repos/r/multi-agent",
    );
  });

  it("says 'parallel' (never 'fan-out') in the header", () => {
    render(mount());
    expect(screen.getByText(/parallel/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/fan-out/i);
  });

  it("keeps the last data and shows the error when a refetch fails", () => {
    group.isError = true;
    render(mount());
    expect(screen.getByRole("alert").textContent).toBe(results.pollError);
    expect(screen.getByText("Security")).toBeTruthy();
  });

  it("shows the group message and each error, and hides the disagreement block, when all failed", () => {
    group.data = run([col("r1", "Security", "failed", "boom one"), col("r2", "Style", "failed", "boom two")]);
    render(mount());
    expect(screen.getByText("All agents failed")).toBeTruthy();
    expect(screen.getByText("boom one")).toBeTruthy();
    expect(screen.getByText("boom two")).toBeTruthy();
    expect(screen.queryByText("Where agents disagree")).toBeNull();
  });

  it("restores view and agent from the URL, ignores bad values, and writes changes with router.replace", () => {
    search = "view=tabs&agent=r2";
    render(mount());
    const tabs = screen.getAllByRole("tab");
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tabs[0]!);
    expect(replace).toHaveBeenLastCalledWith("/repos/r/multi-agent/482?view=tabs&agent=r1");
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    expect(replace).toHaveBeenLastCalledWith("/repos/r/multi-agent/482?view=columns&agent=r2");
    cleanup();

    search = "view=bogus&agent=nope";
    render(mount());
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("button", { name: "Columns" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens the trace drawer for a running member and accepts only member run ids", () => {
    search = "trace=r2";
    render(mount());
    expect(screen.getByTestId("drawer")).toBeTruthy();
    expect(drawer).toHaveBeenLastCalledWith(
      expect.objectContaining({ runId: "r2", running: true, agentName: "Style", prNumber: 482 }),
    );
    cleanup();
    drawer.mockReset();

    search = "trace=not-a-member";
    render(mount());
    expect(screen.queryByTestId("drawer")).toBeNull();

    cleanup();
    search = "";
    render(mount());
    fireEvent.click(screen.getAllByRole("button", { name: "View trace" })[0]!);
    expect(replace).toHaveBeenLastCalledWith("/repos/r/multi-agent/482?trace=r1");
  });

  it("updates the displayed statuses when a refetch returns new data", () => {
    const { rerender } = render(mount());
    expect(screen.getByText("Running")).toBeTruthy();
    group.data = run([col("r1", "Security", "done"), col("r2", "Style", "done")]);
    rerender(mount());
    expect(screen.queryByText("Running")).toBeNull();
    expect(screen.getAllByText("Done")).toHaveLength(2);
  });
});
