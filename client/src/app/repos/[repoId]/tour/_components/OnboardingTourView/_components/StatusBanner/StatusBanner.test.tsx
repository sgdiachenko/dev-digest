import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingIndexInfo } from "@/lib/types";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { StatusBanner } from "./StatusBanner";

afterEach(cleanup);

const index: OnboardingIndexInfo = {
  status: "degraded",
  reason: "parser crashed",
  files_indexed: 10,
  files_in_repo: 50,
  graph_available: false,
  files_skipped_by_tour: 0,
};

function renderBanner(i: OnboardingIndexInfo, onResync = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <StatusBanner index={i} onResync={onResync} />
    </NextIntlClientProvider>,
  );
  return onResync;
}

describe("StatusBanner", () => {
  it("names status, reason and counts, and Resync calls the callback", () => {
    const onResync = renderBanner(index);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Index is degraded: parser crashed. 10 indexed of 50 files.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it("omits the reason when there is none and handles an unknown total", () => {
    renderBanner({ ...index, reason: null });
    expect(screen.getByRole("status")).toHaveTextContent("Index is degraded. 10 indexed of 50 files.");
    cleanup();
    renderBanner({ ...index, status: "failed", files_in_repo: null });
    expect(screen.getByRole("status")).toHaveTextContent("Index is failed. 10 files indexed.");
  });

  it("renders nothing for a full index", () => {
    renderBanner({ ...index, status: "full" });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
