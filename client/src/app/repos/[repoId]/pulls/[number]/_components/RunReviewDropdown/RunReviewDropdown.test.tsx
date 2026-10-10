import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import multiAgent from "../../../../../../../../messages/en/multiAgent.json";
import common from "../../../../../../../../messages/en/common.json";

const push = vi.fn();
const runReview = vi.fn().mockResolvedValue({ runs: [] });
const startMulti = vi.fn();
let agents: unknown[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents, isPending: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: runReview, isPending: false }),
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useAgentRunEstimates: () => ({ data: [] }),
  useStartGroup: () => ({
    reason: "none",
    blocked: true,
    groupRunning: false,
    resultsHref: null,
    isPending: false,
    error: null,
    conflict: false,
    start: startMulti,
  }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDropdown(props: Partial<React.ComponentProps<typeof RunReviewDropdown>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, multiAgent, common }}>
      <RunReviewDropdown prId="pr1" repoId="r" prNumber={482} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("RunReviewDropdown", () => {
  it("renders the trigger label", () => {
    renderDropdown();
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });

  it("keeps the existing items: Run all, a row's single run, Configure agents…; Escape closes", () => {
    agents = [
      { id: "a1", name: "Security", model: "m", enabled: true },
      { id: "a2", name: "Off", model: "m", enabled: false },
    ];
    renderDropdown();
    const trigger = screen.getByRole("button", { name: /Run Review/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: /Run all/ }));
    expect(runReview).toHaveBeenLastCalledWith({ prId: "pr1", all: true });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Run Off alone" }));
    expect(runReview).toHaveBeenLastCalledWith({ prId: "pr1", agentId: "a2" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /Configure agents/ }));
    expect(push).toHaveBeenCalledWith("/agents");
    expect(screen.getByText("PICK AGENTS TO RUN")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("PICK AGENTS TO RUN")).toBeNull();
  });

  it("offers 'No agents yet' when there are no agents", () => {
    agents = [];
    renderDropdown();
    fireEvent.click(screen.getByRole("button", { name: /Run Review/ }));
    fireEvent.click(screen.getByRole("button", { name: /No agents yet/ }));
    expect(push).toHaveBeenCalledWith("/agents");
  });
});
