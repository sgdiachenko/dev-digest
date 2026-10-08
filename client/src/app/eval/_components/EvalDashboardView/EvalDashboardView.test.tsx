import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { EvalDashboardView } from "./EvalDashboardView";
import { hookState, navState, overviewOf, renderEval, resetEvalState, run } from "../testing";

vi.mock("next/navigation", async () => (await import("../testing")).navigationMock);
vi.mock("@/components/app-shell", async () => (await import("../testing")).appShellMock);
vi.mock("@/lib/hooks/eval", async () => (await import("../testing")).evalHooksMock);

beforeEach(resetEvalState);
afterEach(cleanup);

const agents = [
  {
    agent_id: "a1",
    name: "Security Reviewer",
    model: "gpt-4.1",
    latest: run({ id: "r3", agent_version: 3, cases_passed: 2, cases_total: 3, recall: 0.82, precision: 0.91, citation_accuracy: 0.95 }),
    recall_trend: [0.7, 0.82],
  },
  { agent_id: "a2", name: "Custom Mentor", model: "gpt-4o-mini", latest: null, recall_trend: [] },
];

function setOverview(data: ReturnType<typeof overviewOf> | undefined, extra: Record<string, unknown> = {}) {
  hookState.overview = { data, isLoading: false, isError: false, refetch: hookState.refetchOverview, ...extra };
}

describe("overview (T41)", () => {
  it("shows crumb, heading, agent cards with last run + metrics, and a 6-row recent feed that opens agents", () => {
    const recent = Array.from({ length: 7 }, (_, i) =>
      Object.assign(run({ id: `x${i}`, agent_version: i + 1, agent_id: i % 2 ? "a2" : "a1" }), {
        agent_name: i % 2 ? "Custom Mentor" : "Security Reviewer",
      }),
    );
    setOverview(overviewOf({ agents, recent_runs: recent }));
    renderEval(<EvalDashboardView />);

    expect(screen.getByTestId("crumb")).toHaveTextContent("Skills Lab › Eval Dashboard");
    expect(screen.getByRole("heading", { name: "Eval Dashboard" })).toBeInTheDocument();
    expect(screen.getByText(/Regression harness across all reviewer agents/)).toBeInTheDocument();
    expect(screen.getByText("AGENTS")).toBeInTheDocument();
    expect(screen.getByText(/Recent eval runs/)).toBeInTheDocument();

    const card = screen.getByRole("button", { name: "Open Security Reviewer" });
    expect(within(card).getByText("gpt-4.1")).toBeInTheDocument();
    expect(within(card).getByText("Last run v3 · 2026-05-29 09:14 · 2/3 pass")).toBeInTheDocument();
    expect(within(card).getByText("82%")).toBeInTheDocument();
    expect(within(card).getByText("91%")).toBeInTheDocument();
    expect(within(card).getByText("95%")).toBeInTheDocument();
    expect(within(card).getByRole("img")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Open Custom Mentor" })).getByText("No eval runs yet")).toBeInTheDocument();

    fireEvent.click(card);
    expect(navState.push).toHaveBeenLastCalledWith("/eval?agent=a1");

    const rows = screen.getAllByRole("button").filter((el) => el.tagName === "DIV");
    expect(rows).toHaveLength(6);
    fireEvent.keyDown(rows[1]!, { key: "Enter" });
    expect(navState.push).toHaveBeenLastCalledWith("/eval?agent=a2");
    fireEvent.keyDown(rows[0]!, { key: " " });
    expect(navState.push).toHaveBeenLastCalledWith("/eval?agent=a1");
  });

  it("Run all agents starts runs for all eligible agents and reports the count; an empty result reports no agents", async () => {
    setOverview(overviewOf({ agents, recent_runs: [] }));
    hookState.startAllMutate.mockImplementationOnce((_v: unknown, o: { onSuccess: (r: { run_ids: string[] }) => void }) =>
      o.onSuccess({ run_ids: ["r1", "r2"] }),
    );
    renderEval(<EvalDashboardView />);

    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    expect(hookState.startAllMutate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 runs started"));

    hookState.startAllMutate.mockImplementationOnce((_v: unknown, o: { onSuccess: (r: { run_ids: string[] }) => void }) =>
      o.onSuccess({ run_ids: [] }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    expect(await screen.findByText("No agent has cases and no active run")).toBeInTheDocument();
  });

  it("an unknown ?agent= falls back to the overview with 'Agent not found'", () => {
    navState.search = "agent=zzz";
    setOverview(overviewOf({ agents, recent_runs: [] }));
    renderEval(<EvalDashboardView />);
    expect(screen.getByRole("alert")).toHaveTextContent("Agent not found");
    expect(screen.getByRole("heading", { name: "Eval Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    setOverview(undefined, { isLoading: true });
    renderEval(<EvalDashboardView />);
    expect(screen.getByTestId("eval-skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Eval Dashboard" })).not.toBeInTheDocument();
  });

  it("truncates long agent names with an ellipsis and keeps the full name in the title", () => {
    const long = "A very long reviewer agent name that must never wrap the card";
    setOverview(overviewOf({ agents: [{ ...agents[0]!, name: long }] }));
    renderEval(<EvalDashboardView />);
    const name = screen.getByTitle(long);
    expect(name).toHaveStyle({ textOverflow: "ellipsis", whiteSpace: "nowrap" });
  });

  it("an error without data is a full state with Retry; with data it keeps the cards and offers Retry", () => {
    setOverview(undefined, { isError: true });
    const { unmount } = renderEval(<EvalDashboardView />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load eval data");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(hookState.refetchOverview).toHaveBeenCalledTimes(1);
    unmount();

    setOverview(overviewOf({ agents }), { isError: true });
    renderEval(<EvalDashboardView />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load eval data");
    expect(screen.getByRole("button", { name: "Open Security Reviewer" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(hookState.refetchOverview).toHaveBeenCalledTimes(2);
  });
});

describe("empty overview (T42)", () => {
  it.each([
    ["no agents", overviewOf()],
    ["no agent has a run", overviewOf({ agents: [agents[1]!] })],
  ])("%s -> explains why and links to /agents", (_name, data) => {
    setOverview(data);
    renderEval(<EvalDashboardView />);
    expect(screen.getByText("No eval runs yet", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/Create cases from accepted or dismissed findings/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Agents" })).toHaveAttribute("href", "/agents");
  });
});
