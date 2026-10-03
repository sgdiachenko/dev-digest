import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import { ReviewFocus } from "./ReviewFocus";

afterEach(cleanup);

function renderFocus(items: Parameters<typeof ReviewFocus>[0]["items"], onOpenFile = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <ReviewFocus items={items} onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

describe("ReviewFocus", () => {
  it("lists file:line — reason entries in stored order and opens the clicked one", () => {
    const onOpen = renderFocus([
      { file: "src/b.ts", line: 40, reason: "New limiter", line_verified: true },
      { file: "src/a.ts", line: 1, reason: "Wiring", line_verified: false },
    ]);
    expect(screen.getByText("Review focus — read these first")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("src/b.ts:40 — New limiter");
    expect(items[1]).toHaveTextContent("src/a.ts:1 — Wiring");
    expect(document.querySelector("ul")).not.toBeNull();
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "src/a.ts:1" }));
    expect(onOpen).toHaveBeenCalledWith("src/a.ts", 1);
  });

  it("middle-truncates a long path and keeps the full path as title and accessible name (AC-108)", () => {
    const long = "client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/ReviewFocus/ReviewFocus.tsx";
    const onOpen = renderFocus([{ file: long, line: 12, reason: "Entry point", line_verified: true }]);
    const button = screen.getByRole("button", { name: `${long}:12` });
    expect(button).toHaveAttribute("title", `${long}:12`);
    expect(button.textContent).toContain("…");
    expect(button.textContent).not.toContain(long);
    expect(button.textContent!.endsWith(":12")).toBe(true);
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(long, 12);
  });

  it("shows the empty message with no items", () => {
    renderFocus([]);
    expect(screen.getByText("No specific lines to start from — read the diff in Smart order.")).toBeInTheDocument();
  });
});
