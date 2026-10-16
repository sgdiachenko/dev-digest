import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { renderWithMessages } from "@/components/agent-stats/renderWithMessages";
import { CostBreakdown } from "./CostBreakdown";
import { perfOf } from "../../testing";

afterEach(cleanup);

describe("CostBreakdown", () => {
  it("shows two cards with the cost label, a Deleted agent and an Unknown model entry (AC-132, AC-192, EC-1, EC-2)", () => {
    renderWithMessages(
      <CostBreakdown
        perf={perfOf({
          cost_by_agent: [
            { agent_id: "a1", agent_name: "Security Reviewer", cost_usd: 0.3 },
            { agent_id: null, agent_name: null, cost_usd: 0.18 },
          ],
          cost_by_model: [
            { model: "gpt-4.1", cost_usd: 0.4 },
            { model: null, cost_usd: 0.08 },
          ],
        })}
      />,
    );
    const heading = screen.getByRole("heading", { level: 2, name: /Cost breakdown/ });
    expect(within(heading).getByText("Recorded by DevDigest — not provider billing")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "By agent" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "By model" })).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Deleted agent")).toBeInTheDocument();
    expect(screen.getByText("Unknown model")).toBeInTheDocument();
  });

  it("folds entries beyond five into Other and keeps legend cents equal to the total (AC-133, AC-134)", () => {
    const entries = Array.from({ length: 7 }, (_, i) => ({ agent_id: `a${i}`, agent_name: `Agent ${i}`, cost_usd: 0.333 - i * 0.01 }));
    const total = entries.reduce((s, e) => s + e.cost_usd, 0);
    renderWithMessages(<CostBreakdown perf={perfOf({ cost_by_agent: entries }, { total_cost_usd: total })} />);
    expect(screen.getByText("Other")).toBeInTheDocument();
    const card = screen.getByRole("heading", { name: "By agent" }).parentElement!;
    const cents = within(card)
      .getAllByText(/^\$\d+\.\d\d$/)
      .map((el) => Math.round(parseFloat(el.textContent!.slice(1)) * 100));
    expect(cents.reduce((a, b) => a + b, 0)).toBe(Math.round(total * 100));
  });

  it("shows a less-than marker for a cost under one cent (AC-135, EC-33)", () => {
    renderWithMessages(
      <CostBreakdown
        perf={perfOf({ cost_by_agent: [{ agent_id: "a1", agent_name: "Tiny", cost_usd: 0.004 }, { agent_id: "a2", agent_name: "Big", cost_usd: 1 }] }, { total_cost_usd: 1.004 })}
      />,
    );
    expect(screen.getByText("< $0.01")).toBeInTheDocument();
  });

  it("replaces the rings with the empty text for a null or zero total (AC-136, EC-12)", () => {
    renderWithMessages(<CostBreakdown perf={perfOf({ cost_by_agent: [], cost_by_model: [] }, { total_cost_usd: null })} />);
    expect(screen.getAllByText("No cost recorded in this period")).toHaveLength(2);
    cleanup();
    renderWithMessages(
      <CostBreakdown perf={perfOf({ cost_by_agent: [{ agent_id: "a1", agent_name: "A", cost_usd: 0 }], cost_by_model: [] }, { total_cost_usd: 0 })} />,
    );
    expect(screen.getAllByText("No cost recorded in this period")).toHaveLength(2);
  });
});
