import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prHistoryMessages from "../../../../../../../../messages/en/pr-history.json";

vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: vi.fn(),
}));
vi.mock("@/lib/hooks/pr-history", () => ({
  usePrHistory: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { useBlastRadius } from "@/lib/hooks/blast";
import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(cleanup);

const mockedUseBlastRadius = vi.mocked(useBlastRadius);

const WITH_DOWNSTREAM: BlastRadiusResponse = {
  changed_symbols: [{ name: "rateLimit", file: "src/rate-limit.ts", kind: "function" }],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        {
          name: "handlePublic",
          file: "src/api/public/index.ts",
          line: 23,
          endpoints_affected: ["GET /api/public"],
          crons_affected: [],
        },
      ],
      endpoints_affected: ["GET /api/public"],
      crons_affected: [],
    },
  ],
  summary: "1 changed symbol(s), 1 caller(s) across 1 group(s), 1 endpoint(s) and 0 cron(s) affected.",
  degraded: false,
  reason: null,
};

function renderCard() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ blast: blastMessages, brief: briefMessages, "pr-history": prHistoryMessages }}
    >
      <BlastRadiusCard prId="pr-1" repoFullName="acme/widgets" headSha="deadbeef" />
    </NextIntlClientProvider>,
  );
}

describe("BlastRadiusCard", () => {
  it("defaults to the Tree view and renders a BlastSymbolGroup per downstream group", () => {
    mockedUseBlastRadius.mockReturnValue({
      data: WITH_DOWNSTREAM,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBlastRadius>);
    renderCard();

    expect(screen.getByRole("button", { name: "tree" })).toBeInTheDocument();
    // Tree view (P1, retroactive coverage): the caller file:line renders as a
    // mono link via BlastSymbolGroup, without clicking anything first.
    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
  });

  it("switches to the Graph view on click, showing the legend and graph nodes instead of the tree row", () => {
    mockedUseBlastRadius.mockReturnValue({
      data: WITH_DOWNSTREAM,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBlastRadius>);
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));

    // Graph legend appears; the Tree-only caller row (file:line mono link) is gone.
    expect(screen.getByText("changed symbol")).toBeInTheDocument();
    expect(screen.queryByText("src/api/public/index.ts:23")).not.toBeInTheDocument();
    // The graph itself still renders the symbol + caller + endpoint labels.
    expect(screen.getByText("rateLimit")).toBeInTheDocument();
    expect(screen.getByText("handlePublic")).toBeInTheDocument();
    expect(screen.getByText("GET /api/public")).toBeInTheDocument();
  });

  it("hides the Tree/Graph switch and shows the Tree-flavored empty text when there is no downstream impact", () => {
    const EMPTY: BlastRadiusResponse = {
      changed_symbols: [{ name: "rateLimit", file: "src/rate-limit.ts", kind: "function" }],
      downstream: [],
      summary: "1 changed symbol(s), no downstream callers found.",
      degraded: false,
      reason: null,
    };
    mockedUseBlastRadius.mockReturnValue({
      data: EMPTY,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBlastRadius>);
    renderCard();

    expect(screen.queryByRole("button", { name: "graph" })).not.toBeInTheDocument();
    expect(screen.getByText("1 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
  });
});
