import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingFirstTasks } from "@/lib/types";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { FirstTasksSection } from "./FirstTasksSection";

afterEach(cleanup);

const section: OnboardingFirstTasks = {
  origin: "facts",
  items: [
    { id: "t1", signal: "todo_comment", path: "src/a.ts", path_kind: "file", line: 12, complexity: "low" },
    { id: "t2", signal: "missing_test", path: "src/b.ts", path_kind: "file", line: null, complexity: "medium" },
    { id: "t3", signal: "readme_missing_setup", path: "docs", path_kind: "directory", line: null, complexity: "low" },
  ],
};

function renderSection(s: OnboardingFirstTasks) {
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <FirstTasksSection section={s} repoFullName="o/r" sha="abc123" expanded onToggle={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("FirstTasksSection", () => {
  it("shows a templated title, complexity and the line only when known", () => {
    renderSection(section);
    expect(screen.getByText("Resolve the TODO or FIXME comment in src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("Add tests for src/b.ts")).toBeInTheDocument();
    expect(screen.getByText("Complexity: medium")).toBeInTheDocument();
    expect(screen.getAllByText("Complexity: low")).toHaveLength(2);
    expect(screen.getByText("Line 12")).toBeInTheDocument();
    expect(screen.getAllByText(/^Line /)).toHaveLength(1);
  });

  it("links a directory task to the tree URL and a file task to the blob URL", () => {
    renderSection(section);
    expect(screen.getByRole("link", { name: "Open docs on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/o/r/tree/abc123/docs",
    );
    expect(screen.getByRole("link", { name: "Open src/a.ts on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/o/r/blob/abc123/src/a.ts",
    );
    expect(screen.getByText("Directory")).toBeInTheDocument();
  });

  it("shows the empty message", () => {
    renderSection({ origin: "facts", items: [] });
    expect(screen.getByText("No first tasks were found for this repository")).toBeInTheDocument();
  });
});

describe("FirstTasksSection narrative", () => {
  it("uses narrative title, description and complexity by task_id; line stays from facts", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <FirstTasksSection
          section={section}
          repoFullName="o/r"
          sha="abc123"
          expanded
          onToggle={vi.fn()}
          narrativeSha="abc123"
          narrative={[
            { task_id: "t1", title: "Tidy the TODO", description: "Do it carefully", complexity: "medium" },
            { task_id: "unknown", title: "Ghost", description: "x", complexity: "low" },
          ]}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("AI-written")).toBeInTheDocument();
    expect(screen.getByText("Tidy the TODO")).toBeInTheDocument();
    expect(screen.getByText("Do it carefully")).toBeInTheDocument();
    expect(screen.queryByText("Ghost")).not.toBeInTheDocument();
    expect(screen.getByText("Line 12")).toBeInTheDocument();
    expect(screen.getByText("Add tests for src/b.ts")).toBeInTheDocument();
    expect(screen.getAllByText("Complexity: medium")).toHaveLength(2);
  });

  it("outdated: missing path gets the note", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <FirstTasksSection
          section={section}
          repoFullName="o/r"
          sha="abc123"
          expanded
          onToggle={vi.fn()}
          narrative={[]}
          outdated
          narrativeSha="old"
          currentPaths={new Set(["src/a.ts", "docs/readme.md"])}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByText("Not in current index")).toHaveLength(1);
  });
});
