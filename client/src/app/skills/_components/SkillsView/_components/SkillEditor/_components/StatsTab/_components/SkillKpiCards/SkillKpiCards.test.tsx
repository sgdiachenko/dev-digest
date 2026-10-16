import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import { SkillKpiCards } from "./SkillKpiCards";
import { makeStats, renderWithProviders } from "../../testing";

afterEach(cleanup);

const cardOf = (label: string) => screen.getByText(label).closest("section") as HTMLElement;

describe("SkillKpiCards", () => {
  it("uses the singular for one agent (AC-18)", () => {
    renderWithProviders(<SkillKpiCards stats={makeStats({ agent_count: 1 })} option="30d" />);
    expect(within(cardOf("Used by")).getByText("1 agent")).toBeInTheDocument();
  });

  it("shows — with 'No skill data for this period', never 0%, when no run recorded skill data (AC-19, EC-20)", () => {
    renderWithProviders(
      <SkillKpiCards stats={makeStats({ pull_pct: null, pull_runs: 0, pull_runs_total: 0, runs_without_skill_data: 3 })} option="30d" />,
    );
    const pull = cardOf("Pull frequency (30 days)");
    expect(within(pull).getByText("—")).toBeInTheDocument();
    expect(within(pull).getByText("No skill data for this period")).toBeInTheDocument();
    expect(pull.textContent).not.toContain("0%");
    // AC-20 singular/plural: three runs without data.
    expect(within(pull).getByText(/^3 runs without skill data are not included/)).toBeInTheDocument();
  });

  it("omits the without-data line when every run has data, and uses the singular for one run (AC-20)", () => {
    renderWithProviders(<SkillKpiCards stats={makeStats({ runs_without_skill_data: 0 })} option="30d" />);
    expect(screen.queryByText(/without skill data/)).not.toBeInTheDocument();
    cleanup();
    renderWithProviders(<SkillKpiCards stats={makeStats({ runs_without_skill_data: 1 })} option="30d" />);
    expect(screen.getByText(/^1 run without skill data are not included/)).toBeInTheDocument();
  });

  it("marks a small sample grey with text, and shows 74% coloured by the scale otherwise (AC-22)", () => {
    renderWithProviders(<SkillKpiCards stats={makeStats()} option="30d" />);
    const accept = cardOf("Accept rate (30 days)");
    expect(getComputedStyle(within(accept).getByText("74%")).color).toBe("var(--warn)");
    cleanup();
    renderWithProviders(
      <SkillKpiCards stats={makeStats({ accept_rate: 0.8, accept_pct: 80, accepted: 4, dismissed: 1, pending: 0, small_sample: true })} option="30d" />,
    );
    const small = cardOf("Accept rate (30 days)");
    expect(within(small).getByText("small sample")).toBeInTheDocument();
    expect(within(small).getByText("4 of 5 decided · 0 pending")).toBeInTheDocument();
    expect(getComputedStyle(within(small).getByText("80%")).color).toBe("var(--text-muted)");
  });

  it("shows —, '0 decided' and a ring with no accept colour for a null rate (AC-22, EC-26)", () => {
    const { container } = renderWithProviders(
      <SkillKpiCards stats={makeStats({ accept_rate: null, accept_pct: null, accepted: 0, dismissed: 0, pending: 5 })} option="30d" />,
    );
    const accept = cardOf("Accept rate (30 days)");
    expect(within(accept).getAllByText("—").length).toBeGreaterThanOrEqual(1);
    expect(within(accept).getByText("0 decided")).toBeInTheDocument();
    // Only the track circle is drawn; no coloured arc.
    expect(accept.querySelectorAll("svg circle")).toHaveLength(1);
    expect(container.textContent).not.toContain("0%");
  });
});
