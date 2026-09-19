import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/skills.json";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

let statsResult: { data: unknown; isLoading: boolean; isError: boolean };
vi.mock("../../../../../../../../lib/hooks/skills", () => ({
  useSkillStats: () => statsResult,
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skillId="sk1" />
    </NextIntlClientProvider>,
  );
}

describe("StatsTab (smoke)", () => {
  it("renders — for pull/accept when there is no data yet, never 0%", () => {
    statsResult = {
      isLoading: false,
      isError: false,
      data: { agent_count: 1, pull_pct: null, accept_pct: null, findings_30d: 0, by_category: [], agents: [{ id: "a1", name: "Test Quality Reviewer" }] },
    };
    renderWithIntl();
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(2); // pull frequency + accept rate
    expect(screen.getByText("Test Quality Reviewer")).toBeInTheDocument();
    expect(screen.getByText("No findings in the last 30 days.")).toBeInTheDocument();
  });

  it("renders real percentages and counts when there's data", () => {
    statsResult = {
      isLoading: false,
      isError: false,
      data: {
        agent_count: 3,
        pull_pct: 71,
        accept_pct: 74,
        findings_30d: 12,
        by_category: [{ category: "security", count: 8 }],
        agents: [{ id: "a1", name: "Security Reviewer" }],
      },
    };
    renderWithIntl();
    expect(screen.getByText("71%")).toBeInTheDocument();
    expect(screen.getByText("74%")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders an empty-agents hint when no agent has this skill linked", () => {
    statsResult = {
      isLoading: false,
      isError: false,
      data: { agent_count: 0, pull_pct: null, accept_pct: null, findings_30d: 0, by_category: [], agents: [] },
    };
    renderWithIntl();
    expect(screen.getByText("Not linked to any agent yet.")).toBeInTheDocument();
  });
});
