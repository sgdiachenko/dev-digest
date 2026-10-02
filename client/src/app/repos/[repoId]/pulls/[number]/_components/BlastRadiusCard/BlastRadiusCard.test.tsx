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
const mockResyncMutate = vi.fn();
vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({
    mutate: mockResyncMutate, isPending: false, isError: false,
  }),
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
      <BlastRadiusCard prId="pr-1" repoId="repo-1" repoFullName="acme/widgets" headSha="deadbeef" />
    </NextIntlClientProvider>,
  );
}

const EMPTY_DOWNSTREAM: BlastRadiusResponse = {
  changed_symbols: [{ name: "rateLimit", file: "src/rate-limit.ts", kind: "function" }],
  downstream: [],
  summary: "1 changed symbol(s), no downstream callers found.",
  degraded: false,
  reason: null,
};

describe("BlastRadiusCard", () => {
  it("keeps later symbol groups collapsed until the reader opens them", () => {
    mockedUseBlastRadius.mockReturnValue({
      data: {
        ...WITH_DOWNSTREAM,
        downstream: [
          ...WITH_DOWNSTREAM.downstream,
          {
            symbol: "bucketKey",
            callers: [{ name: "secondCaller", file: "src/buckets.ts", line: 42, endpoints_affected: [], crons_affected: [] }],
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBlastRadius>);
    renderCard();

    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
    expect(screen.queryByText("src/buckets.ts:42")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /bucketKey/ }));
    expect(screen.getByText("src/buckets.ts:42")).toBeInTheDocument();
  });

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
    mockedUseBlastRadius.mockReturnValue({
      data: EMPTY_DOWNSTREAM,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBlastRadius>);
    renderCard();

    expect(screen.queryByRole("button", { name: "graph" })).not.toBeInTheDocument();
    expect(screen.getByText("1 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
  });

  it("shows the Graph-flavored empty text when downstream becomes empty while already in Graph view", () => {
    mockedUseBlastRadius.mockReturnValue({
      data: WITH_DOWNSTREAM,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBlastRadius>);
    const { rerender } = renderCard();

    // Switch to Graph view while there is still data to graph.
    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.getByText("changed symbol")).toBeInTheDocument();

    // Data refetches to empty (e.g. the PR's diff changed) while `view` stays
    // "graph" — local component state, not reset by a data change.
    mockedUseBlastRadius.mockReturnValue({
      data: EMPTY_DOWNSTREAM,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBlastRadius>);
    rerender(
      <NextIntlClientProvider
        locale="en"
        messages={{ blast: blastMessages, brief: briefMessages, "pr-history": prHistoryMessages }}
      >
        <BlastRadiusCard prId="pr-1" repoId="repo-1" repoFullName="acme/widgets" headSha="deadbeef" />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByRole("button", { name: "graph" })).not.toBeInTheDocument();
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    expect(screen.queryByText("1 changed symbol(s), no downstream callers found.")).not.toBeInTheDocument();
  });

  it("shows a degraded badge with a reason and a Resync action that triggers useResyncRepoIntel", () => {
    mockedUseBlastRadius.mockReturnValue({
      data: { ...EMPTY_DOWNSTREAM, degraded: true, reason: "index_partial" },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBlastRadius>);
    renderCard();

    expect(screen.getByText("Best-effort — repo index is incomplete")).toBeInTheDocument();
    expect(screen.getByText("The repo index is only partially built.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resync index" }));
    expect(mockResyncMutate).toHaveBeenCalledTimes(1);
  });
});
