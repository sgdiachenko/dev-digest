import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import multiAgent from "../../../../../../../../../../messages/en/multiAgent.json";
import common from "../../../../../../../../../../messages/en/common.json";
import { ApiError } from "@/lib/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const mutate = vi.fn();
const start: { isPending: boolean; error: Error | null } = { isPending: false, error: null };
const hooks = {
  estimates: [{ agent_id: "a1", runs: 5, avg_duration_ms: 6000, avg_cost_usd: 0.01 }] as unknown[],
  group: null as unknown,
};
// Hook boundary: the fake mirrors useStartGroup's contract over the test state.
vi.mock("@/lib/hooks/multi-agent", async () => {
  const { startBlockReason } = await import("@/lib/multi-agent");
  return {
    useAgentRunEstimates: () => ({ data: hooks.estimates }),
    useStartGroup: (i: { repoId: string; prId: string | null; prNumber: number | null; checked: string[]; loading: boolean }) => {
      const groupRunning = !!(hooks.group as { columns: { status: string }[] } | null)?.columns.some(
        (c) => c.status === "running",
      );
      const reason = startBlockReason({
        checked: i.checked.length,
        prSelected: !!i.prId,
        loading: i.loading,
        runningGroup: groupRunning,
      });
      const resultsHref = i.prNumber != null ? `/repos/${i.repoId}/multi-agent/${i.prNumber}` : null;
      const error = start.error;
      return {
        reason,
        blocked: reason !== null || start.isPending,
        groupRunning,
        resultsHref,
        isPending: start.isPending,
        error,
        conflict: error instanceof ApiError && error.status === 409,
        start: () => mutate({ prId: i.prId, agentIds: i.checked }, { onSuccess: () => push(resultsHref) }),
      };
    },
  };
});

import { AgentPicker } from "./AgentPicker";

const agent = (id: string, name: string, enabled = true) => ({ id, name, enabled }) as Agent;
const AGENTS = [agent("a1", "Security"), agent("a2", "Style"), agent("a3", "Perf"), agent("a4", "Off", false)];

beforeEach(() => {
  start.isPending = false;
  start.error = null;
  hooks.group = null;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPicker(props: Partial<React.ComponentProps<typeof AgentPicker>> = {}) {
  const onRunAgent = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent, common }}>
      <AgentPicker prId="pr1" repoId="r" prNumber={482} agents={AGENTS} loading={false} onRunAgent={onRunAgent} {...props} />
    </NextIntlClientProvider>,
  );
  return { onRunAgent };
}

const runButton = () => screen.getByRole("button", { name: /Run multi-agent review/ });
const boxes = () => screen.getAllByRole("checkbox");

describe("AgentPicker", () => {
  it("lists the agents with estimates, keeps disabled agents unchecked, and checking never starts a run", () => {
    renderPicker();
    expect(screen.getByText("PICK AGENTS TO RUN")).toBeInTheDocument();
    expect(boxes()).toHaveLength(4);
    expect(screen.getByText("~6s")).toBeInTheDocument();
    expect(screen.getAllByText("no data")).toHaveLength(3);
    expect(boxes()[3]).toBeDisabled();

    fireEvent.click(boxes()[0]!);
    expect(boxes()[0]).toHaveAttribute("aria-checked", "true");
    expect(runButton()).toBeDisabled();
    expect(runButton()).toHaveTextContent("(1)");
    fireEvent.click(boxes()[1]!);
    expect(runButton()).toBeEnabled();
    expect(runButton()).toHaveTextContent("(2)");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("Clear unchecks every agent", () => {
    renderPicker();
    fireEvent.click(boxes()[0]!);
    fireEvent.click(boxes()[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    boxes().forEach((b) => expect(b).toHaveAttribute("aria-checked", "false"));
    expect(runButton()).toHaveTextContent("(0)");
  });

  it("runs the group with agent_ids and navigates to the results page", () => {
    renderPicker();
    fireEvent.click(boxes()[0]!);
    fireEvent.click(boxes()[2]!);
    mutate.mockImplementation((_in, opts) => opts.onSuccess());
    fireEvent.click(runButton());
    expect(mutate).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1", "a3"] }, expect.anything());
    expect(push).toHaveBeenCalledWith("/repos/r/multi-agent/482");
  });

  it("a row's run button runs that agent alone, even a disabled one", () => {
    const { onRunAgent } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Run Off alone" }));
    expect(onRunAgent).toHaveBeenCalledWith("a4");
  });

  it("footer links to the Configure screen with the PR preselected", () => {
    renderPicker();
    expect(screen.getByRole("link", { name: "Configure multi-agent run…" })).toHaveAttribute(
      "href",
      "/repos/r/multi-agent?pr=482",
    );
  });

  it("keeps the selection and shows the reason when the run fails; a 409 adds a link", () => {
    start.error = new ApiError("agent not found", 422);
    renderPicker();
    fireEvent.click(boxes()[0]!);
    fireEvent.click(boxes()[1]!);
    expect(screen.getByRole("alert")).toHaveTextContent("agent not found");
    expect(boxes()[0]).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("link", { name: /already in progress/ })).toBeNull();
    cleanup();

    start.error = new ApiError("running", 409);
    renderPicker();
    expect(screen.getByRole("link", { name: /already in progress/ })).toHaveAttribute(
      "href",
      "/repos/r/multi-agent/482",
    );
  });

  it("disables the run while the latest group is running and links to its results", () => {
    hooks.group = { columns: [{ status: "running" }] };
    renderPicker();
    fireEvent.click(boxes()[0]!);
    fireEvent.click(boxes()[1]!);
    expect(runButton()).toBeDisabled();
    expect(screen.getByRole("link", { name: /in progress. View results/ })).toHaveAttribute(
      "href",
      "/repos/r/multi-agent/482",
    );
  });

  it("keeps the run disabled with fewer than 2 enabled agents or while loading", () => {
    renderPicker({ agents: [agent("a1", "Only"), agent("a2", "Off", false)] });
    fireEvent.click(boxes()[0]!);
    expect(runButton()).toBeDisabled();
    cleanup();
    renderPicker({ loading: true });
    expect(runButton()).toBeDisabled();
  });

  it("truncates long agent names", () => {
    const LONG = "Very long agent name ".repeat(10).trim();
    renderPicker({ agents: [agent("a1", LONG), agent("a2", "B")] });
    expect(screen.getByText(LONG)).toHaveStyle({ textOverflow: "ellipsis" });
  });
});
