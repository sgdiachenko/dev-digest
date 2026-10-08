import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { PromptBlock } from "./PromptBlock";

afterEach(cleanup);

function renderBlock() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <PromptBlock label="Project context — attached specs (untrusted)" text={"## Project context\nbody"} color="blue" />
    </NextIntlClientProvider>,
  );
}

describe("PromptBlock fullscreen Copy (AC-33)", () => {
  it("copies exactly the stored block text from the dialog footer and confirms it", () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderBlock();
    fireEvent.click(screen.getByRole("button", { name: "Open fullscreen" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("## Project context\nbody");
    expect(within(dialog).getByRole("button", { name: "Copied!" })).toBeInTheDocument();
  });
});

describe("PromptBlock fullscreen dialog focus (NFR-6)", () => {
  it("moves focus into the dialog, closes on Escape and returns focus to the trigger", () => {
    renderBlock();
    const trigger = screen.getByRole("button", { name: "Open fullscreen" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("keeps Tab inside the dialog (wraps last → first and first → last)", () => {
    renderBlock();
    fireEvent.click(screen.getByRole("button", { name: "Open fullscreen" }));
    const dialog = screen.getByRole("dialog");
    const focusables = within(dialog).getAllByRole("button");
    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).not.toBe(last);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("pulls focus back in when it escapes to the page behind the dialog", () => {
    renderBlock();
    const trigger = screen.getByRole("button", { name: "Open fullscreen" });
    fireEvent.click(trigger);
    trigger.focus(); // the page behind
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });
});
