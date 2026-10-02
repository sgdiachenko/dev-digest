import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Risk } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const LONG = "src/very/deeply/nested/folder/structure/that/goes/on/and/on/forever/rate-limit.ts";

const RISKS: Risk[] = [
  { kind: "security", title: "Auth bypass", explanation: "<b>bold</b> **md** explanation", severity: "high", file_refs: ["src/a.ts:12", LONG + ":3"] },
  { kind: "licensing", title: "Odd kind", explanation: "e2", severity: "low", file_refs: ["gone/elsewhere.ts"] },
];

function renderAreas(risks: Risk[], onOpenFile = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <RiskAreas risks={risks} changedFiles={["src/a.ts", LONG]} onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

describe("RiskAreas", () => {
  it("shows severity as icon + word, titles, refs; expands a risk and renders model text literally", () => {
    renderAreas(RISKS);
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("Auth bypass")).toBeInTheDocument();
    expect(screen.queryByText(/explanation/)).toBeNull();

    const [toggle] = screen.getAllByRole("button", { name: "Show explanation" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle!);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // HTML / markdown is shown literally, not interpreted (AC-80)
    expect(screen.getByText("<b>bold</b> **md** explanation")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("opens a ref inside the PR, truncates long paths with the full path in the accessible name, and marks outside refs as text", () => {
    const onOpen = renderAreas(RISKS);
    fireEvent.click(screen.getByRole("button", { name: "src/a.ts:12" }));
    expect(onOpen).toHaveBeenCalledWith("src/a.ts", 12);

    const long = screen.getByRole("button", { name: LONG + ":3" });
    expect(long.textContent).toContain("…");
    expect(long.textContent!.length).toBeLessThan(LONG.length);
    expect(long).toHaveAttribute("title", LONG + ":3");

    expect(screen.getByText("gone/elsewhere.ts")).toBeInTheDocument();
    expect(screen.getByText("(not in this PR's diff)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "gone/elsewhere.ts" })).toBeNull();
  });

  it("shows the empty message when there are no risks", () => {
    renderAreas([]);
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });
});
