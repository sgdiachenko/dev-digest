import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { OnThisPage } from "./OnThisPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const items = [
  { id: "architecture", label: "Architecture overview" },
  { id: "run-locally", label: "How to run locally" },
];

function stubNarrow(narrow: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches: narrow,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderNav(onExpand = vi.fn(), activeId: string | null = "architecture") {
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <OnThisPage items={items} activeId={activeId} onExpand={onExpand} />
      <section id="run-locally">
        <h2 id="run-locally-heading" tabIndex={-1}>
          Run
        </h2>
      </section>
      <section id="architecture">
        <h2 id="architecture-heading" tabIndex={-1}>
          Arch
        </h2>
      </section>
    </NextIntlClientProvider>,
  );
  return onExpand;
}

describe("OnThisPage", () => {
  it("lists every section and marks the active one with aria-current", () => {
    stubNarrow(false);
    renderNav();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Architecture overview" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "How to run locally" })).not.toHaveAttribute("aria-current");
  });

  it("activating an anchor expands, scrolls, focuses the heading and sets the hash", () => {
    stubNarrow(false);
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const onExpand = renderNav();
    fireEvent.click(screen.getByRole("link", { name: "How to run locally" }));
    expect(onExpand).toHaveBeenCalledWith("run-locally");
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.getElementById("run-locally-heading"));
    expect(window.location.hash).toBe("#run-locally");
  });

  it("narrow viewports get a Jump to select that navigates the same way", () => {
    stubNarrow(true);
    const onExpand = renderNav(vi.fn(), null);
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.change(screen.getByLabelText("Jump to"), { target: { value: "run-locally" } });
    expect(onExpand).toHaveBeenCalledWith("run-locally");
    expect(window.location.hash).toBe("#run-locally");
  });

  it("stays operable with a nothing-active state (loading)", () => {
    stubNarrow(false);
    renderNav(vi.fn(), null);
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
    expect(screen.queryAllByRole("link").filter((l) => l.hasAttribute("aria-current"))).toHaveLength(0);
  });
});
