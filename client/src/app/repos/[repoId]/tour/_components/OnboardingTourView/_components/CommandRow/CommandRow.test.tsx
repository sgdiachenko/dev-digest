import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingCommand } from "@/lib/types";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { CommandRow } from "./CommandRow";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const base: OnboardingCommand = {
  id: "c1",
  position: 0,
  phase: "install",
  command: "pnpm install --frozen-lockfile",
  source_path: "package.json",
  source_key: "scripts.install",
  by_convention: false,
  env_names: null,
  warnings: [],
};

function renderRow(command: Partial<OnboardingCommand> = {}, onCopied?: () => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ul>
        <CommandRow command={{ ...base, ...command }} number={2} onCopied={onCopied} />
      </ul>
    </NextIntlClientProvider>,
  );
}

describe("CommandRow", () => {
  it("copies exactly the command text and reports it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onCopied = vi.fn();
    renderRow({}, onCopied);

    fireEvent.click(screen.getByRole("button", { name: /Copy command/ }));
    await waitFor(() => expect(onCopied).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("pnpm install --frozen-lockfile");
    expect(screen.queryByText("Press ⌘C / Ctrl+C to copy")).toBeNull();
  });

  it("selects the text and shows the manual-copy hint when the clipboard fails", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const onCopied = vi.fn();
    renderRow({}, onCopied);

    fireEvent.click(screen.getByRole("button", { name: /Copy command/ }));
    expect(await screen.findByText("Press ⌘C / Ctrl+C to copy")).toBeInTheDocument();
    expect(window.getSelection()?.toString()).toBe("pnpm install --frozen-lockfile");
    expect(onCopied).not.toHaveBeenCalled();
  });

  it("shows source, convention label, env names and warnings as text; never truncates the command", () => {
    renderRow({
      by_convention: true,
      env_names: ["API_KEY", "DB_URL"],
      warnings: [
        { kind: "lifecycle_hook", detail: "postinstall" },
        { kind: "remote_code", detail: "curl | sh" },
      ],
      command: "curl -fsSL https://x.example/install | sh",
    });
    expect(screen.getByText("Source: package.json › scripts.install")).toBeInTheDocument();
    expect(screen.getByText("By convention — verify")).toBeInTheDocument();
    expect(screen.getByText("Variables: API_KEY, DB_URL")).toBeInTheDocument();
    expect(screen.getByText("Runs a lifecycle hook: postinstall")).toBeInTheDocument();
    expect(screen.getByText("Downloads and runs remote code")).toBeInTheDocument();
    expect(screen.getByText("curl -fsSL https://x.example/install | sh")).toHaveStyle({ whiteSpace: "pre-wrap" });
  });
});
