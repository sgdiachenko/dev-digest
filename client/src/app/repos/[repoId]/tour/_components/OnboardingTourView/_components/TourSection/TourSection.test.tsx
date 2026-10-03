import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { TourSection } from "./TourSection";

afterEach(cleanup);

function renderSection(props: Partial<React.ComponentProps<typeof TourSection>> = {}) {
  const onToggle = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <TourSection id="run-locally" title="How to run locally" origin="facts" expanded onToggle={onToggle} {...props}>
        <p>section body</p>
      </TourSection>
    </NextIntlClientProvider>,
  );
  return { onToggle };
}

describe("TourSection", () => {
  it("is expanded with a facts label, a focusable heading and a named aria-expanded toggle", () => {
    const { onToggle } = renderSection();
    expect(screen.getByText("From repository facts")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How to run locally" })).toHaveAttribute("tabindex", "-1");
    const btn = screen.getByRole("button", { name: "Collapse How to run locally" });
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("section body")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("collapsed: hides the body, keeps the heading anchor, and the toggle reads Expand", () => {
    renderSection({ expanded: false });
    expect(screen.queryByText("section body")).toBeNull();
    expect(document.getElementById("run-locally")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Expand How to run locally" })).toHaveAttribute("aria-expanded", "false");
  });

  it("origin 'ai' shows the AI-written label instead of the facts label", () => {
    renderSection({ origin: "ai" });
    expect(screen.getByText("AI-written")).toBeInTheDocument();
    expect(screen.queryByText("From repository facts")).toBeNull();
  });

  it("shows the empty message in place of the children", () => {
    renderSection({ emptyMessage: "No run commands found in manifests or README" });
    expect(screen.getByText("No run commands found in manifests or README")).toBeInTheDocument();
    expect(screen.queryByText("section body")).toBeNull();
    expect(screen.getByRole("heading", { name: "How to run locally" })).toBeInTheDocument();
  });
});
