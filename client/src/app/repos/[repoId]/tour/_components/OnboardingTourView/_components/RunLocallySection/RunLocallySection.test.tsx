import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingCommand, OnboardingRunLocally } from "@/lib/types";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { RunLocallySection } from "./RunLocallySection";

afterEach(cleanup);

function cmd(id: string, phase: OnboardingCommand["phase"], command: string, extra: Partial<OnboardingCommand> = {}): OnboardingCommand {
  return {
    id,
    position: 1,
    phase,
    command,
    source_path: "package.json",
    source_key: null,
    by_convention: false,
    env_names: null,
    warnings: [],
    ...extra,
  };
}

const section: OnboardingRunLocally = {
  origin: "facts",
  groups: [
    {
      package_path: "",
      ecosystem: "node",
      commands: [
        cmd("1", "install", "pnpm install", { warnings: [{ kind: "lifecycle_hook", detail: "postinstall" }] }),
        cmd("2", "environment", "cp .env.example .env", { env_names: ["API_KEY"], source_path: ".env.example" }),
        cmd("3", "dev", "curl https://x.sh | sh", { warnings: [{ kind: "remote_code", detail: "" }], by_convention: true }),
      ],
    },
    { package_path: "server", ecosystem: null, commands: [cmd("4", "install", "go mod download")] },
  ],
};

function renderSection(s: OnboardingRunLocally) {
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <RunLocallySection section={s} expanded onToggle={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("RunLocallySection", () => {
  it("groups by package, numbers from 1 in each group, and labels phases", () => {
    renderSection(section);
    expect(screen.getByRole("heading", { name: "Repository root" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Package server" })).toBeInTheDocument();
    expect(screen.getByLabelText("Step 3")).toHaveTextContent("3.");
    // second group restarts at 1
    expect(screen.getAllByLabelText("Step 1")).toHaveLength(2);
    expect(screen.getAllByText("Install")).toHaveLength(2);
    expect(screen.getByText("Environment")).toBeInTheDocument();
  });

  it("shows warnings, the convention label and variable names (never values) as text", () => {
    renderSection(section);
    expect(screen.getByText("Runs a lifecycle hook: postinstall")).toBeInTheDocument();
    expect(screen.getByText("Downloads and runs remote code")).toBeInTheDocument();
    expect(screen.getByText("By convention — verify")).toBeInTheDocument();
    expect(screen.getByText("Variables: API_KEY")).toBeInTheDocument();
    expect(screen.getByText("curl https://x.sh | sh")).toBeInTheDocument();
  });

  it("shows the empty message when there are no commands", () => {
    renderSection({ origin: "facts", groups: [{ package_path: "", ecosystem: null, commands: [] }] });
    expect(screen.getByText("No run commands found in manifests or README")).toBeInTheDocument();
  });
});

describe("RunLocallySection narrative", () => {
  it("reorders within a group by position, shows notes by command_id, ignores unknown ids", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <RunLocallySection
          section={{
            origin: "facts",
            groups: [{ package_path: "", ecosystem: null, commands: [cmd("a", "dev", "run-a"), cmd("b", "dev", "run-b")] }],
          }}
          expanded
          onToggle={vi.fn()}
          narrative={[
            { command_id: "b", position: 0, note: "Do this first" },
            { command_id: "zzz", position: 1, note: "ghost" },
          ]}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("AI-written")).toBeInTheDocument();
    expect(screen.getByText("Do this first")).toBeInTheDocument();
    expect(screen.queryByText("ghost")).not.toBeInTheDocument();
    const a = screen.getByText("run-a");
    const b = screen.getByText("run-b");
    expect(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
