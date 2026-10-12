import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import multiAgent from "../../../../../../../messages/en/multiAgent.json";
import common from "../../../../../../../messages/en/common.json";
import { ApiError } from "@/lib/api";

const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r" }),
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "o/r" } }),
  useRepoNotFound: () => false,
}));

const state = {
  pulls: { data: [{ id: "pr482", number: 482, title: "Fix it" }, { id: "pr1", number: 1, title: "Other" }], isPending: false },
  agents: {
    data: [
      { id: "a1", name: "Security", enabled: true },
      { id: "a2", name: "Style", enabled: true },
      { id: "a3", name: "Off", enabled: false },
    ],
    isPending: false,
    isError: false,
  } as { data: unknown; isPending: boolean; isError: boolean },
  estimates: {
    data: [
      { agent_id: "a1", runs: 5, avg_duration_ms: 6000, avg_cost_usd: 0.01 },
      { agent_id: "a2", runs: 5, avg_duration_ms: 12000, avg_cost_usd: 0.02 },
    ],
  },
  group: { data: null as unknown },
};
const mutate = vi.fn();
const startState: { isPending: boolean; error: Error | null } = { isPending: false, error: null };

vi.mock("@/lib/hooks/core", () => ({ usePulls: () => state.pulls }));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => state.agents }));
// Hook boundary: the fake mirrors useStartGroup's contract over the test state.
vi.mock("@/lib/hooks/multi-agent", async () => {
  const { startBlockReason } = await import("@/lib/multi-agent");
  return {
    useAgentRunEstimates: () => state.estimates,
    useStartGroup: (i: { repoId: string; prId: string | null; prNumber: number | null; checked: string[]; loading: boolean }) => {
      const groupRunning = !!(state.group.data as { columns: { status: string }[] } | null)?.columns.some(
        (c) => c.status === "running",
      );
      const reason = startBlockReason({
        checked: i.checked.length,
        prSelected: !!i.prId,
        loading: i.loading,
        runningGroup: groupRunning,
      });
      const resultsHref = i.prNumber != null ? `/repos/${i.repoId}/multi-agent/${i.prNumber}` : null;
      const error = startState.error;
      return {
        reason,
        blocked: reason !== null || startState.isPending,
        groupRunning,
        resultsHref,
        isPending: startState.isPending,
        error,
        conflict: error instanceof ApiError && error.status === 409,
        start: () => mutate({ prId: i.prId, agentIds: i.checked }, { onSuccess: () => push(resultsHref) }),
      };
    },
  };
});

import { ConfigureForm } from "./ConfigureForm";

beforeEach(() => {
  search = "";
  startState.isPending = false;
  startState.error = null;
  state.group.data = null;
  state.agents.isPending = false;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent, common }}>
      <ConfigureForm />
    </NextIntlClientProvider>,
  );
}

const startButton = () => screen.getByRole("button", { name: /Run multi-agent review/ });

describe("ConfigureForm", () => {
  it("Select all checks every enabled agent and leaves disabled ones unchecked, then clears", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    const [a1, a2, a3] = screen.getAllByRole("checkbox");
    expect(a1).toHaveAttribute("aria-checked", "true");
    expect(a2).toHaveAttribute("aria-checked", "true");
    expect(a3).toHaveAttribute("aria-checked", "false");
    expect(startButton()).toHaveTextContent("(2)");
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(startButton()).toHaveTextContent("(0)");
  });

  it("gates the start button on a PR and 2+ agents, shows totals, then runs and navigates", () => {
    search = "pr=482";
    renderForm();
    expect(screen.getByRole("combobox")).toHaveValue("pr482");
    expect(startButton()).toBeDisabled();
    expect(startButton()).toHaveTextContent("(0)");
    expect(screen.getByText("Pick at least 2 agents.")).toBeInTheDocument();

    const [a1, a2, a3] = screen.getAllByRole("checkbox");
    expect(a3).toBeDisabled();
    fireEvent.click(a1!);
    expect(screen.getByText(/One agent is not a multi-agent run/)).toBeInTheDocument();
    fireEvent.click(a2!);
    expect(startButton()).toBeEnabled();
    expect(startButton()).toHaveTextContent("(2)");
    expect(screen.getByText(/≈ 12s · \$0\.03/)).toBeInTheDocument();

    mutate.mockImplementation((_in, opts) => opts.onSuccess());
    fireEvent.click(startButton());
    expect(mutate).toHaveBeenCalledWith({ prId: "pr482", agentIds: ["a1", "a2"] }, expect.anything());
    expect(push).toHaveBeenCalledWith("/repos/r/multi-agent/482");
  });

  it("preselects nothing for an unknown ?pr= and asks for a PR first", () => {
    search = "pr=999";
    renderForm();
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByText("Select a pull request first.")).toBeInTheDocument();
  });

  it("disables the button and links to the results while the PR's group is running", () => {
    search = "pr=482";
    state.group.data = { columns: [{ status: "running" }] };
    renderForm();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(startButton()).toBeDisabled();
    expect(screen.getByRole("link", { name: "View results" })).toHaveAttribute("href", "/repos/r/multi-agent/482");
  });

  it("shows skeletons and keeps the button disabled while agents load", () => {
    state.agents.isPending = true;
    state.agents.data = undefined;
    renderForm();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(startButton()).toBeDisabled();
    expect(screen.getByText("Loading agents…")).toBeInTheDocument();
    state.agents.data = [];
  });

  it("notes that two enabled agents are needed", () => {
    state.agents.data = [{ id: "a1", name: "Only", enabled: true }];
    renderForm();
    expect(screen.getByText(/at least 2 enabled agents/)).toBeInTheDocument();
  });

  it("shows the error text and keeps the selection; a 409 adds a link to the active group", async () => {
    search = "pr=482";
    state.agents.data = [
      { id: "a1", name: "Security", enabled: true },
      { id: "a2", name: "Style", enabled: true },
    ];
    startState.error = new ApiError("Too many requests", 429);
    const { rerender } = renderForm();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(screen.getByRole("alert")).toHaveTextContent("Too many requests");
    expect(screen.getAllByRole("checkbox")[0]).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("link", { name: /already in progress/ })).toBeNull();

    startState.error = new ApiError("A multi-agent run is already running", 409);
    rerender(
      <NextIntlClientProvider locale="en" messages={{ multiAgent, common }}>
        <ConfigureForm />
      </NextIntlClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /already in progress/ })).toHaveAttribute(
        "href",
        "/repos/r/multi-agent/482",
      ),
    );
    expect(screen.getAllByRole("checkbox")[0]).toHaveAttribute("aria-checked", "true");
  });

  it.each([
    ["422", new ApiError("Agent <b>x</b> has no model", 422), "Agent <b>x</b> has no model"],
    ["404", new ApiError("Pull request not found", 404), "Pull request not found"],
    ["429", new ApiError("Slow down, rate limited", 429), "Slow down, rate limited"],
    ["network", new TypeError("Failed to fetch"), "Failed to fetch"],
  ])("shows the %s failure reason as text and keeps the selection", (_n, err, text) => {
    search = "pr=482";
    state.agents.data = [
      { id: "a1", name: "Security", enabled: true },
      { id: "a2", name: "Style", enabled: true },
    ];
    startState.error = err as Error;
    renderForm();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(screen.getByRole("alert").querySelector("b")).toBeNull();
    expect(screen.getAllByRole("checkbox")[0]).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("checkbox")[1]).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("link", { name: /already in progress/ })).toBeNull();
  });
});
