import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import { AgentView } from "./AgentView";
import { comparisonOf, hookState, makeUrl, renderEval, resetEvalState, run } from "../testing";

vi.mock("@/lib/hooks/eval", async () => (await import("../testing")).evalHooksMock);

beforeEach(resetEvalState);
afterEach(cleanup);

const agent = { agent_id: "a1", name: "Security Reviewer", model: "gpt-4.1", latest: null, recall_trend: [] };
const other = { agent_id: "a2", name: "Custom Mentor", model: "gpt-4o-mini", latest: null, recall_trend: [] };

const v2 = run({ id: "r2", agent_version: 2, started_at: "2026-05-27T16:40:00.000Z", recall: 0.7, precision: 0.9, citation_accuracy: 0.9, cost_usd: 0.2 });
const v3 = run({ id: "r3", agent_version: 3, started_at: "2026-05-29T09:14:00.000Z", recall: 0.75, precision: 0.85, citation_accuracy: 0.9, cost_usd: 0.012 });

function setRuns(data: ReturnType<typeof run>[], extra: Record<string, unknown> = {}) {
  hookState.runs = { data, isLoading: false, isError: false, refetch: hookState.refetchRuns, ...extra };
}
const view = (url = makeUrl()) => <AgentView agent={agent} agents={[agent, other]} url={url} />;
const checkbox = (version: string) => screen.getByRole("checkbox", { name: `Select run ${version}` });

describe("AgentView (T43)", () => {
  it("shows the header, three metric cards with deltas in points, the trend points and the run table (AC-106, 107, 112, 175)", () => {
    setRuns([v3, v2]);
    renderEval(view());

    expect(screen.getByRole("button", { name: "‹ All agents" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("Regression harness · 2 runs on 3 cases")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeEnabled();

    expect(screen.getByText("RECALL")).toBeInTheDocument();
    expect(screen.getByText("▲ 5 pts")).toBeInTheDocument(); // recall 70 -> 75
    expect(screen.getByText("▼ 5 pts")).toBeInTheDocument(); // precision 90 -> 85
    expect(screen.getByText("no change")).toBeInTheDocument(); // citation

    for (const col of ["Ran at", "Version", "Recall", "Precision", "Citation accuracy", "Cases passed", "Cost", "Status"]) {
      expect(screen.getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByTitle("v3 · cost $0.01")).toBeInTheDocument();
  });

  it("has no delta with a single run (AC-176)", () => {
    setRuns([v2]);
    renderEval(view());
    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
    expect(screen.queryByText("no change")).not.toBeInTheDocument();
  });

  it("switches the agent through the dropdown and narrows runs with '30 days' (AC-108, AC-111)", () => {
    setRuns([v3, v2]);
    const url = makeUrl();
    renderEval(view(url));

    fireEvent.click(screen.getByRole("button", { name: "Agent" }));
    fireEvent.click(screen.getByText("Custom Mentor"));
    expect(url.selectAgent).toHaveBeenCalledWith("a2");

    expect(hookState.runsCall).toHaveBeenLastCalledWith("a1", undefined);
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    const [id, since] = hookState.runsCall.mock.calls.at(-1)!;
    expect(id).toBe("a1");
    expect(Date.parse(since as string)).toBeGreaterThan(Date.now() - 31 * 86_400_000);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(hookState.runsCall).toHaveBeenLastCalledWith("a1", undefined);
  });

  it("raises a computed regression alert at -5 points, not at -4 (AC-113)", () => {
    const v6 = run({ id: "r6", agent_version: 6, started_at: "2026-05-27T00:00:00.000Z", precision: 0.91 });
    setRuns([run({ id: "r7", agent_version: 7, started_at: "2026-05-29T00:00:00.000Z", precision: 0.86 }), v6]);
    const { unmount } = renderEval(view());
    expect(screen.getByText("Precision −5 pts on v7 vs v6")).toBeInTheDocument();
    unmount();

    setRuns([run({ id: "r7", agent_version: 7, started_at: "2026-05-29T00:00:00.000Z", precision: 0.87 }), v6]);
    renderEval(view());
    expect(screen.queryByText(/Precision −/)).not.toBeInTheDocument();
  });

  it("selects exactly two runs to compare; a third drops the earliest pick (AC-119, 120, NFR-10)", () => {
    const v1 = run({ id: "r1", agent_version: 1, started_at: "2026-05-20T00:00:00.000Z" });
    setRuns([v3, v2, v1]);
    const url = makeUrl();
    renderEval(view(url));

    const compare = screen.getByRole("button", { name: "Compare" });
    expect(screen.getByText("Select two runs to compare")).toBeInTheDocument();
    expect(compare).toBeDisabled();

    // real, focusable buttons: Space/Enter activate them natively
    expect(checkbox("v3").tagName).toBe("BUTTON");
    fireEvent.click(checkbox("v3"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(compare).toBeDisabled();
    fireEvent.click(checkbox("v2"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(compare).toBeEnabled();

    fireEvent.click(checkbox("v1")); // third pick: v3 (earliest picked) is dropped
    expect(checkbox("v3")).toHaveAttribute("aria-checked", "false");
    expect(checkbox("v2")).toHaveAttribute("aria-checked", "true");
    expect(checkbox("v1")).toHaveAttribute("aria-checked", "true");

    fireEvent.click(compare);
    expect(url.openCompare).toHaveBeenCalledWith("r2", "r1");
  });

  it("disables selection for runs without metrics and says why (AC-121, EC-33)", () => {
    setRuns([run({ id: "rf", agent_version: 4, status: "failed", recall: null, precision: null, citation_accuracy: null, cases_passed: null }), v3]);
    renderEval(view());
    expect(checkbox("v4")).toBeDisabled();
    expect(checkbox("v3")).toBeEnabled();
    expect(screen.getByText("No metrics for this run")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("starts a run, shows progress, disables the button and announces politely (AC-151, 152, 86, 91)", () => {
    setRuns([run({ id: "rr", agent_version: 4, status: "running", cases_completed: 1, recall: null, precision: null, citation_accuracy: null, cases_passed: null }), v3]);
    hookState.run = { data: { ...run({ id: "rr", status: "running", cases_completed: 1 }), per_case: [] } };
    renderEval(view());

    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
    expect(screen.getAllByText("1 / 3 cases").length).toBeGreaterThan(0);
    const live = document.querySelector('[aria-live="polite"][role="status"]')!;
    expect(live).toHaveTextContent("1 / 3 cases");
    const cancels = screen.getAllByRole("button", { name: /Cancel/ });
    expect(cancels.length).toBeGreaterThan(0);
    fireEvent.click(cancels[0]!);
    expect(hookState.cancelMutate).toHaveBeenCalledWith("rr", expect.anything());
  });

  it("announces the result and refreshes the list when the run settles (AC-86)", () => {
    const running = run({ id: "rr", agent_version: 4, status: "running", cases_completed: 2 });
    setRuns([running, v3]);
    hookState.run = { data: { ...running, per_case: [] } };
    const { rerenderEval } = renderEval(view());

    hookState.run = { data: { ...run({ id: "rr", agent_version: 4, status: "completed", recall: 0.8, precision: 0.9, citation_accuracy: 0.95 }), per_case: [] } };
    rerenderEval(view());
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "Run finished: Completed. Recall 80%, precision 90%, citation accuracy 95%.",
    );
    expect(hookState.refetchRuns).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeEnabled();
  });

  it("starts the suite from the header button", () => {
    setRuns([v3]);
    renderEval(view());
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(hookState.startMutate).toHaveBeenCalledTimes(1);
  });

  it("shows only an empty state, with the run button, when the agent has no runs (AC-163, 164)", () => {
    setRuns([]);
    renderEval(view());
    expect(screen.getByText("No eval runs for Security Reviewer yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Run all evals" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("RECALL")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByText("No eval runs for Security Reviewer yet").parentElement!).getByRole("button", { name: "Run all evals" }));
    expect(hookState.startMutate).toHaveBeenCalledTimes(1);
  });

  it("goes back to the overview", () => {
    setRuns([v3]);
    const url = makeUrl();
    renderEval(view(url));
    fireEvent.click(screen.getByRole("button", { name: "‹ All agents" }));
    expect(url.backToOverview).toHaveBeenCalled();
  });

  it("opens the compare modal from a deep link and refuses an unknown run (AC-128, 129)", () => {
    setRuns([v3, v2]);
    hookState.comparison = { data: comparisonOf(), isLoading: false, isError: false };
    const { unmount } = renderEval(view(makeUrl({ compareIds: ["r2", "r3"] })));
    expect(screen.getByRole("dialog")).toHaveTextContent("Compare runs · v2 → v3");
    unmount();

    hookState.comparison = { data: undefined, isLoading: false, isError: true };
    renderEval(view(makeUrl({ compareIds: ["r2", "nope"] })));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Run not available for comparison");
    expect(screen.getByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
  });
});
