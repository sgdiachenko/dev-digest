import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { TourUnavailable } from "./TourUnavailable";

afterEach(cleanup);

function renderIt(reason: "not_cloned" | "not_indexed", onResync?: () => void) {
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <TourUnavailable reason={reason} onResync={onResync} />
    </NextIntlClientProvider>,
  );
}

describe("TourUnavailable", () => {
  it("not_cloned shows the message and a Resync that calls the callback", () => {
    const onResync = vi.fn();
    renderIt("not_cloned", onResync);
    expect(screen.getByText("This repository is not cloned yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it("not_indexed shows the indexing message and no Resync", () => {
    renderIt("not_indexed", vi.fn());
    expect(screen.getByText("Indexing — the tour appears when the index is ready")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
