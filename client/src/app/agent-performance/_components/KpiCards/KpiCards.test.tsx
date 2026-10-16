import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { renderWithMessages } from "@/components/agent-stats/renderWithMessages";
import { KpiCards } from "./KpiCards";
import { perfOf } from "../../testing";

afterEach(cleanup);

describe("KpiCards", () => {
  it("shows runs, cost with its label, accept and the most active agent, all labelled with the period (AC-54, AC-101-AC-108)", () => {
    renderWithMessages(<KpiCards perf={perfOf()} option="30d" />);
    const runs = screen.getByRole("region", { name: "Total runs (30 days)" });
    expect(within(runs).getByText("22")).toBeInTheDocument();
    expect(within(runs).getByText("1 failed · 1 cancelled")).toBeInTheDocument();
    expect(within(runs).getByRole("img", { name: "Runs per day, 0 to 3" })).toBeInTheDocument();

    const cost = screen.getByRole("region", { name: "Total cost (30 days)" });
    expect(within(cost).getByText("$0.48")).toBeInTheDocument();
    expect(within(cost).getByText("Recorded by DevDigest — not provider billing")).toBeInTheDocument();

    const accept = screen.getByRole("region", { name: "Avg accept rate (30 days)" });
    expect(within(accept).getByText("73%")).toBeInTheDocument();
    expect(within(accept).getByText("16 of 22 decided · 4 pending")).toBeInTheDocument();

    const top = screen.getByRole("region", { name: "Most active (30 days)" });
    expect(within(top).getByText("Security Reviewer")).toBeInTheDocument();
    expect(within(top).getByText("13 runs · 76% accept")).toBeInTheDocument();
  });

  it("shows the cost change only when both totals are known, and the unknown-cost line (AC-138, AC-139, AC-190)", () => {
    renderWithMessages(
      <KpiCards perf={perfOf({}, { total_cost_usd: 8.74, previous_total_cost_usd: 9.94, unknown_cost_runs: 2 })} option="30d" />,
    );
    expect(screen.getByText("↓ $1.20 vs previous 30 days")).toBeInTheDocument();
    expect(screen.getByText("cost unknown for 2 runs")).toBeInTheDocument();
    cleanup();
    renderWithMessages(<KpiCards perf={perfOf({}, { previous_total_cost_usd: null })} option="30d" />);
    expect(screen.queryByText(/vs previous/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cost unknown/)).not.toBeInTheDocument();
  });

  it("marks a small sample, shows in-progress runs and thousands separators (AC-107, EC-6, EC-15)", () => {
    renderWithMessages(
      <KpiCards
        perf={perfOf({}, { total_cost_usd: 1234.56, in_progress: 2, small_sample: true, accepted: 3, dismissed: 2, pending: 0, avg_accept_rate: 0.6 })}
        option="30d"
      />,
    );
    expect(screen.getByText("$1,234.56")).toBeInTheDocument();
    expect(screen.getByText("2 in progress (not counted)")).toBeInTheDocument();
    expect(screen.getByText("small sample")).toBeInTheDocument();
  });

  it("shows a dash and the empty text without a most-active agent (AC-109, EC-11)", () => {
    renderWithMessages(<KpiCards perf={perfOf({}, { most_active: null, avg_accept_rate: null, accepted: 0, dismissed: 0, pending: 0, small_sample: true })} option="1d" />);
    const top = screen.getByRole("region", { name: "Most active (1 day)" });
    expect(within(top).getByText("—")).toBeInTheDocument();
    expect(within(top).getByText("No agent ran in this period")).toBeInTheDocument();
  });
});
