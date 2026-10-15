import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillStats, SkillWithStats } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import agentPerformance from "../../../../../messages/en/agentPerformance.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const STATS: SkillStats = {
  agent_count: 3,
  agents: [],
  pull_pct: 71,
  accept_pct: 74,
  findings_30d: 96,
  by_category: [],
  findings: 96,
  skill_runs: 7,
  pull_runs: 5,
  pull_runs_total: 7,
  runs_without_skill_data: 0,
  accepted: 12,
  dismissed: 4,
  pending: 80,
  accept_rate: 0.74,
  small_sample: false,
  last_used_at: "2026-10-14T09:00:00.000Z",
  period: { from: "2026-09-15T00:00:00.000Z", to: "2026-10-15T00:00:00.000Z" },
  as_of: "2026-10-15T00:00:00.000Z",
};

const SKILL: SkillWithStats = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Rubric for evaluating overall PR quality",
  type: "rubric",
  source: "manual",
  body: "# Rubric",
  enabled: true,
  version: 1,
  evidence_files: null,
  stats: STATS,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages, agentPerformance }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the name and type/source badges", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("shows '3 agents · 71% pull · 74% accept', the accept figure coloured by the scale, and '1 agent' for one (AC-35)", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("71% pull")).toBeInTheDocument();
    const accept = screen.getByText("74% accept");
    expect(accept).toBeInTheDocument();
    expect(getComputedStyle(accept).color).toBe("var(--warn)");
    cleanup();
    renderWithIntl(<SkillCard skill={{ ...SKILL, stats: { ...STATS, agent_count: 1, accept_pct: 80, accept_rate: 0.8 } }} />);
    expect(screen.getByText("1 agent")).toBeInTheDocument();
    expect(getComputedStyle(screen.getByText("80% accept")).color).toBe("var(--ok)");
  });

  it("shows 'small sample' in grey in place of the accept percent (AC-36)", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, stats: { ...STATS, small_sample: true } }} />);
    const note = screen.getByText("small sample");
    expect(getComputedStyle(note).color).toBe("var(--text-muted)");
    expect(screen.queryByText(/74%/)).not.toBeInTheDocument();
  });

  it("shows — (not 0%) for null pull and accept (AC-37)", () => {
    renderWithIntl(
      <SkillCard skill={{ ...SKILL, stats: { ...STATS, pull_pct: null, accept_pct: null, accept_rate: null } }} />,
    );
    expect(screen.getByText("— pull")).toBeInTheDocument();
    expect(screen.getByText("— accept")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
  });

  it("shows no stats footer for a skill with no linked agent (AC-38)", () => {
    renderWithIntl(
      <SkillCard skill={{ ...SKILL, stats: { ...STATS, agent_count: 0, pull_pct: null, accept_pct: null, accept_rate: null } }} />,
    );
    expect(screen.queryByText(/agents?$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pull/)).not.toBeInTheDocument();
    expect(screen.queryByText(/accept/)).not.toBeInTheDocument();
  });

  it("shows '5 of 7 runs · 12 of 16 decided' on hover and on keyboard focus, and Enter on it does not open the card (AC-39)", () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} />);
    const footer = screen.getByText("3 agents").parentElement as HTMLElement;
    expect(footer).toHaveAttribute("tabindex", "0");
    fireEvent.focus(footer);
    expect(screen.getByRole("tooltip")).toHaveTextContent("5 of 7 runs · 12 of 16 decided");
    fireEvent.blur(footer);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(footer.parentElement as HTMLElement);
    expect(screen.getByRole("tooltip")).toHaveTextContent("5 of 7 runs · 12 of 16 decided");
    fireEvent.keyDown(footer, { key: "Enter" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("makes no request when a card renders (NFR-5) and takes the units from the catalog (NFR-12)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("flags an imported-but-disabled skill as needing vetting", () => {
    const imported: SkillWithStats = { ...SKILL, source: "imported_url", enabled: false };
    renderWithIntl(<SkillCard skill={imported} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("clicking the enabled toggle does not trigger the card's own onClick (navigation)", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("exposes an unambiguous link target for the editor and supports keyboard navigation", () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} />);
    const link = screen.getByRole("link", { name: "Open skill pr-quality-rubric" });
    fireEvent.click(link);
    fireEvent.keyDown(link, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("asks in a modal before deleting a skill", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
