import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingCriticalPaths } from "@/lib/types";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { CriticalPathsSection } from "./CriticalPathsSection";

afterEach(cleanup);

const section: OnboardingCriticalPaths = {
  origin: "facts",
  graph_based: true,
  items: [
    { path: "src/my file#1.ts", score: 7, tags: ["entry_point", "high_fan_in"], route_count: 3, importer_count: 0 },
    { path: "src/b.ts", score: 2, tags: ["docs"], route_count: null, importer_count: null },
  ],
};

function renderSection(s: OnboardingCriticalPaths) {
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <CriticalPathsSection section={s} repoFullName="o/r" sha="abc123" expanded onToggle={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("CriticalPathsSection", () => {
  it("shows tags as text, score, and counts only where the index has them (zero is shown)", () => {
    renderSection(section);
    expect(screen.getByText("From repository facts")).toBeInTheDocument();
    expect(screen.getByText("Entry point")).toBeInTheDocument();
    expect(screen.getByText("High fan-in")).toBeInTheDocument();
    expect(screen.getByText("Score 7")).toBeInTheDocument();
    expect(screen.getByText("3 routes")).toBeInTheDocument();
    expect(screen.getByText("0 importers")).toBeInTheDocument();
    expect(screen.getAllByText(/routes?$/)).toHaveLength(1);
    expect(screen.getAllByText(/importers?$/)).toHaveLength(1);
  });

  it("links each file to GitHub at the SHA with encoded segments in a new tab", () => {
    renderSection(section);
    const link = screen.getByRole("link", { name: "Open src/my file#1.ts on GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com/o/r/blob/abc123/src/my%20file%231.ts");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("labels the heuristic order when there is no import graph", () => {
    renderSection({ ...section, graph_based: false });
    expect(screen.getByText("Heuristic order — no import graph")).toBeInTheDocument();
  });

  it("shows the section-specific empty message", () => {
    renderSection({ ...section, items: [] });
    expect(screen.getByText("No critical paths could be determined for this repository")).toBeInTheDocument();
  });
});

describe("CriticalPathsSection narrative", () => {
  function renderNarr(extra: Partial<React.ComponentProps<typeof CriticalPathsSection>>) {
    render(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <CriticalPathsSection section={section} repoFullName="o/r" sha="abc123" expanded onToggle={vi.fn()} {...extra} />
      </NextIntlClientProvider>,
    );
  }

  it("labels AI-written, keeps facts order and shows the description by path", () => {
    renderNarr({ narrative: [{ path: "src/b.ts", description: "Docs helper" }], narrativeSha: "abc123" });
    expect(screen.getByText("AI-written")).toBeInTheDocument();
    expect(screen.getByText("Docs helper")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAccessibleName("Open src/my file#1.ts on GitHub");
  });

  it("outdated: unknown path gets the note and links use the narrative sha", () => {
    renderNarr({
      narrative: [],
      outdated: true,
      narrativeSha: "old999",
      currentPaths: new Set(["src/b.ts"]),
    });
    expect(screen.getAllByText("Not in current index")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open src/b.ts on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/o/r/blob/old999/src/b.ts",
    );
  });
});
