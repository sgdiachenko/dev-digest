import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentPerfRow } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import statsMessages from "../../../../../messages/en/agentPerformance.json";
import { AgentCard } from "./AgentCard";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages, agentPerformance: statsMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("asks in a modal before deleting an agent", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

const ROW: AgentPerfRow = {
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  enabled: true,
  runs: 13,
  failed: 0,
  cancelled: 0,
  total_cost_usd: 0.494,
  avg_cost_usd: 0.038,
  unknown_cost_runs: 0,
  avg_duration_ms: 6200,
  accepted: 19,
  dismissed: 6,
  pending: 0,
  accept_rate: 0.76,
  small_sample: false,
  previous_accept_rate: null,
  previous_small_sample: false,
  last_run_at: "2026-10-14T09:00:00.000Z",
  last_runs: [],
};

/** The stats line is one element whose text is spread over several spans. */
const statsLine = (text: string) => screen.getByText((_, el) => el?.tagName === "DIV" && el.textContent === text);

describe("AgentCard stats line", () => {
  it("shows runs, accept rate and average cost (AC-165)", () => {
    renderWithIntl(<AgentCard ag={AGENT} statsRow={ROW} />);
    expect(statsLine("13 runs · 76% accept · $0.038 avg")).toBeInTheDocument();
  });

  it("shows 'small sample' or '— accept' in place of the percent (AC-166)", () => {
    const { unmount } = renderWithIntl(<AgentCard ag={AGENT} statsRow={{ ...ROW, small_sample: true }} />);
    expect(statsLine("13 runs · small sample · $0.038 avg")).toBeInTheDocument();
    unmount();
    renderWithIntl(<AgentCard ag={AGENT} statsRow={{ ...ROW, accept_rate: null }} />);
    expect(statsLine("13 runs · — accept · $0.038 avg")).toBeInTheDocument();
  });

  it("shows 'No runs in 30 days' for an agent without runs (AC-167)", () => {
    renderWithIntl(<AgentCard ag={AGENT} statsRow={{ ...ROW, runs: 0, avg_cost_usd: null, accept_rate: null }} />);
    expect(screen.getByText("No runs in 30 days")).toBeInTheDocument();
  });

  it("shows no line while loading or after a failed read, and leaves the card intact (AC-168, AC-169)", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} statsRow={undefined} onToggle={() => {}} />);
    expect(screen.queryByText(/accept|No runs in 30 days|\bavg\b/)).toBeNull();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    cleanup();
    renderWithIntl(<AgentCard ag={AGENT} statsRow={null} />);
    expect(screen.queryByText(/accept|\bavg\b/)).toBeNull();
  });

  it("carries the cost label on hover and focus and in the accessible description of the average (AC-195)", () => {
    renderWithIntl(<AgentCard ag={AGENT} statsRow={ROW} />);
    const avg = screen.getByText("$0.038 avg");
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(avg);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Recorded by DevDigest — not provider billing");
    fireEvent.mouseLeave(avg);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(avg);
    expect(avg).toHaveAccessibleDescription("Recorded by DevDigest — not provider billing");
  });
});
