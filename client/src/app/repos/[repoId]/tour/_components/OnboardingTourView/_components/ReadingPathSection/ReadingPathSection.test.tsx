import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingReadingPath } from "@/lib/types";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { ReadingPathSection } from "./ReadingPathSection";

afterEach(cleanup);

const section: OnboardingReadingPath = {
  origin: "facts",
  graph_based: true,
  items: [
    { position: 1, path: "src/main.ts", reason: "entry_point", imported_by_position: null, tags: ["entry_point"] },
    { position: 2, path: "src/util.ts", reason: "imported_by", imported_by_position: 1, tags: [] },
    { position: 3, path: "src/db.ts", reason: "critical", imported_by_position: null, tags: ["data_schema"] },
  ],
};

function renderSection(s: OnboardingReadingPath) {
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ReadingPathSection section={s} repoFullName="o/r" sha="abc123" expanded onToggle={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("ReadingPathSection", () => {
  it("numbers items by position and states why each is included", () => {
    renderSection(section);
    expect(screen.getByLabelText("Item 1")).toHaveTextContent("1");
    expect(screen.getByLabelText("Item 3")).toHaveTextContent("3");
    expect(screen.getByText("Imported by item 1")).toBeInTheDocument();
    expect(screen.getByText("Critical file")).toBeInTheDocument();
    expect(screen.getByText("Data schema")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("opens a file on GitHub at the SHA", () => {
    renderSection(section);
    expect(screen.getByRole("link", { name: "Open src/db.ts on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/o/r/blob/abc123/src/db.ts",
    );
  });

  it("labels the heuristic order without a graph", () => {
    renderSection({ ...section, graph_based: false });
    expect(screen.getByText("Heuristic order — no import graph")).toBeInTheDocument();
  });

  it("shows the empty message", () => {
    renderSection({ ...section, items: [] });
    expect(screen.getByText("No reading path could be built for this repository")).toBeInTheDocument();
  });
});

describe("ReadingPathSection narrative", () => {
  it("shows descriptions by path in facts order and the not-in-index note when outdated", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <ReadingPathSection
          section={{
            origin: "facts",
            graph_based: true,
            items: [
              { position: 1, path: "src/a.ts", reason: "entry_point", imported_by_position: null, tags: [] },
              { position: 2, path: "src/gone.ts", reason: "critical", imported_by_position: null, tags: [] },
            ],
          }}
          repoFullName="o/r"
          sha="abc123"
          expanded
          onToggle={vi.fn()}
          narrative={[{ path: "src/a.ts", description: "Start here" }]}
          narrativeSha="old"
          outdated
          currentPaths={new Set(["src/a.ts"])}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("AI-written")).toBeInTheDocument();
    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(screen.getAllByText("Not in current index")).toHaveLength(1);
  });
});
