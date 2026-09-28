import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrHistory } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/pr-history.json";

vi.mock("@/lib/hooks/pr-history", () => ({
  usePrHistory: vi.fn(),
}));

import { usePrHistory } from "@/lib/hooks/pr-history";
import { PriorPrsSection } from "./PriorPrsSection";

afterEach(cleanup);

const mockedUsePrHistory = vi.mocked(usePrHistory);

const HISTORY: PrHistory = {
  history: [
    {
      pr_number: 401,
      title: "Earlier config change",
      merged_at: "2026-05-01T00:00:00Z",
      author: "marisa.koch",
      files_overlap: ["src/config.ts"],
      notes: "",
    },
  ],
};

function renderSection() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ "pr-history": messages }}>
      <PriorPrsSection prId="pr-1" repoFullName="acme/widgets" />
    </NextIntlClientProvider>,
  );
}

describe("PriorPrsSection", () => {
  it("does not query until expanded, then renders the list once open (enabled follows local state)", () => {
    mockedUsePrHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof usePrHistory>);
    renderSection();

    // Collapsed by default: the hook was called with enabled: false.
    expect(mockedUsePrHistory).toHaveBeenCalledWith("pr-1", { enabled: false });
    expect(screen.queryByText("Earlier config change")).not.toBeInTheDocument();

    // Expand: the hook is now called with enabled: true (this is what actually
    // gates the query — usePrHistory itself is mocked here, so this asserts the
    // component's contract with the hook, not TanStack Query internals).
    mockedUsePrHistory.mockReturnValue({
      data: HISTORY,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof usePrHistory>);
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));

    expect(mockedUsePrHistory).toHaveBeenCalledWith("pr-1", { enabled: true });
    expect(screen.getByText("Earlier config change")).toBeInTheDocument();
    expect(screen.getByText("#401")).toBeInTheDocument();
  });

  it("renders the empty and error states once expanded", () => {
    mockedUsePrHistory.mockReturnValue({
      data: { history: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof usePrHistory>);
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));
    expect(screen.getByText("No merged PRs previously touched these files.")).toBeInTheDocument();

    cleanup();
    mockedUsePrHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof usePrHistory>);
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));
    expect(screen.getByText("Couldn't load prior PRs")).toBeInTheDocument();
  });
});
