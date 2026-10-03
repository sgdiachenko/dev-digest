import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingIndexInfo } from "@/lib/types";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { TourHeader } from "./TourHeader";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const index: OnboardingIndexInfo = {
  status: "partial",
  reason: null,
  files_indexed: 40,
  files_in_repo: 120,
  graph_available: true,
  files_skipped_by_tour: 0,
};

function renderHeader(props: Partial<React.ComponentProps<typeof TourHeader>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <TourHeader repoName="acme/api" sha="0123456789abcdef" index={index} onExport={() => {}} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("TourHeader", () => {
  it("shows title, 7-char sha, counts and a text status chip", () => {
    renderHeader();
    expect(screen.getByRole("heading", { level: 1, name: "Onboarding for api" })).toBeInTheDocument();
    expect(screen.getByText("api")).toHaveStyle({ fontFamily: "var(--font-mono, monospace)" });
    expect(screen.getByText("Commit 0123456")).toBeInTheDocument();
    expect(screen.getByText("40 indexed of 120 files")).toBeInTheDocument();
    expect(screen.getByText("Index: partial")).toBeInTheDocument();
  });

  it("falls back to a count without total when the total is unknown", () => {
    renderHeader({ index: { ...index, files_in_repo: null } });
    expect(screen.getByText("40 files indexed")).toBeInTheDocument();
  });

  it("copies the current URL (with hash) and announces it politely", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    window.history.replaceState(null, "", "/repos/r/tour#run-locally");
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Link copied"));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/repos\/r\/tour#run-locally$/));
  });

  it("announces a clipboard failure instead of staying silent", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not copy the link"));
  });

  it("calls onExport and renders the actions and meta slots", () => {
    const onExport = vi.fn();
    renderHeader({ onExport, actions: <button type="button">Slot action</button>, meta: <p>Slot meta</p>, estimate: <p>Slot estimate</p> });
    fireEvent.click(screen.getByRole("button", { name: "Export as Markdown" }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Slot action" })).toBeInTheDocument();
    expect(screen.getByText("Slot meta")).toBeInTheDocument();
    expect(screen.getByText("Slot estimate")).toBeInTheDocument();
  });

  it("omits Export when there is nothing to export", () => {
    renderHeader({ onExport: undefined });
    expect(screen.queryByRole("button", { name: "Export as Markdown" })).toBeNull();
  });
});
