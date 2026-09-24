import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

const findingActionMutate = vi.fn();
let smartDiffResult: { data: SmartDiff | undefined; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
};
let reviewsResult: { data: ReviewRecord[] | undefined } = { data: [] };

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrReviews: () => reviewsResult,
  useFindingAction: () => ({ mutate: findingActionMutate, isPending: false }),
}));
vi.mock("../../../../../../../lib/hooks/smart-diff", () => ({
  usePrSmartDiff: () => smartDiffResult,
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  findingActionMutate.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// A file whose patch renders an added line at RIGHT:5 (so a CRITICAL finding
// there is "in the diff"); a finding on line 999 is never in this patch.
const SERVICE_PATCH = ["@@ -1,1 +1,5 @@", " ctx1", " ctx2", " ctx3", " ctx4", "+added5"].join("\n");

const FILES: PrFile[] = [
  { path: "src/service.ts", additions: 1, deletions: 0, patch: SERVICE_PATCH },
  { path: "src/service.test.ts", additions: 4, deletions: 0, patch: "@@ -1,1 +1,1 @@\n+test" },
  { path: "README.md", additions: 2, deletions: 0, patch: "@@ -1,1 +1,1 @@\n+doc" },
  { path: "package-lock.json", additions: 40, deletions: 0, patch: "@@ -1,1 +1,1 @@\n+lock" },
];

function smartFile(path: string, findingIds: string[] = []): SmartDiff["groups"][number]["files"][number] {
  const f = FILES.find((x) => x.path === path)!;
  return {
    path,
    additions: f.additions,
    deletions: f.deletions,
    finding_ids: findingIds,
    finding_lines: findingIds.length > 0 ? [5] : [],
  };
}

const SMART_DIFF: SmartDiff = {
  groups: [
    { role: "core", files: [smartFile("src/service.ts", ["f-in-diff", "f-outside"])] },
    { role: "tests", files: [smartFile("src/service.test.ts")] },
    { role: "docs", files: [smartFile("README.md")] },
    { role: "boilerplate", files: [smartFile("package-lock.json")] },
  ],
  split_suggestion: { too_big: false, total_lines: 47, proposed_splits: [] },
};

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f-in-diff",
    review_id: "rev-1",
    severity: "CRITICAL",
    category: "security",
    title: "In-diff finding",
    file: "src/service.ts",
    start_line: 5,
    end_line: 5,
    rationale: "because",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const REVIEW: ReviewRecord = {
  id: "rev-1",
  pr_id: "pr1",
  agent_id: "a1",
  run_id: "run-1",
  agent_name: "Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: "s",
  score: 60,
  model: "gpt-4.1",
  created_at: "2026-06-01T00:00:00Z",
  findings: [
    finding({ id: "f-in-diff", start_line: 5, severity: "CRITICAL", title: "In-diff finding" }),
    finding({
      id: "f-outside",
      start_line: 999,
      severity: "WARNING",
      title: "Outside-diff finding",
      category: "bug",
    }),
  ],
};

function renderDiffTab(props: Partial<React.ComponentProps<typeof DiffTab>> = {}) {
  return renderWithIntl(
    <DiffTab
      prId="pr1"
      filesCount={FILES.length}
      files={FILES}
      canComment
      repoFullName="acme/widgets"
      headSha="abc123"
      {...props}
    />,
  );
}

describe("DiffTab — Smart Diff grouping and order toggle", () => {
  it("groups files by role in the fixed order, collapses docs/boilerplate by default, and switches to Original order", () => {
    smartDiffResult = { data: SMART_DIFF, isLoading: false, isError: false };
    reviewsResult = { data: [REVIEW] };
    renderDiffTab();

    const groupHeaders = screen.getAllByRole("button", { name: /Core|Tests|Docs|Boilerplate/ });
    expect(groupHeaders.map((h) => h.getAttribute("aria-expanded"))).toEqual(["true", "true", "false", "false"]);

    // A file inside a collapsed group (docs) isn't rendered in Smart order…
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();

    // …but switching to Original order shows the flat, ungrouped file list.
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("package-lock.json")).toBeInTheDocument();
  });
});

describe("DiffTab — finding indicators", () => {
  it("counts files (not findings) on the group's ● badge, shows the line label and card, splits outside-diff findings, and accepts", () => {
    smartDiffResult = { data: SMART_DIFF, isLoading: false, isError: false };
    reviewsResult = { data: [REVIEW] };
    renderDiffTab();

    // Two findings live on ONE file — the group badge counts FILES, not findings.
    expect(screen.getByLabelText("1 files with findings")).toHaveTextContent("● 1");

    // The dot only marks the file that actually has findings.
    expect(screen.getAllByLabelText("This file has findings")).toHaveLength(1);

    // The in-diff finding's line carries a "blocker" label and its card is
    // visible by default (findings exist ⇒ annotations start shown, D8).
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("In-diff finding")).toBeInTheDocument();

    // The line-999 finding isn't in this patch — it renders in the
    // "outside the diff" block instead, with its own title text.
    expect(screen.getByText("1 finding(s) outside the diff")).toBeInTheDocument();
    expect(screen.getByText("Outside-diff finding")).toBeInTheDocument();

    // Expand the in-diff card and accept it.
    const card = screen.getByText("In-diff finding").closest('[data-finding-id="f-in-diff"]')!;
    fireEvent.click(within(card as HTMLElement).getByText("In-diff finding"));
    fireEvent.click(within(card as HTMLElement).getByText("Accept"));
    expect(findingActionMutate).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: "f-in-diff", action: "accept", prId: "pr1" }),
    );
  });
});

describe("DiffTab — empty state and Smart Diff fallback", () => {
  it("shows 'Review not run yet' while grouping still works", () => {
    smartDiffResult = { data: SMART_DIFF, isLoading: false, isError: false };
    reviewsResult = { data: [] };
    renderDiffTab();

    expect(screen.getByText("Review not run yet")).toBeInTheDocument();
    // Grouping still renders normally.
    expect(screen.getByRole("button", { name: /Core/ })).toBeInTheDocument();
  });

  it("falls back to Original order and disables the switch when Smart Diff errors", () => {
    smartDiffResult = { data: undefined, isLoading: false, isError: true };
    reviewsResult = { data: [] };
    renderDiffTab();

    // No role groups — the flat file list renders directly.
    expect(screen.queryByRole("button", { name: /Core/ })).not.toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smart order" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Original order" })).toBeDisabled();
  });

  it("offsets RoleGroup's sticky header by the headerHeight prop (page.tsx measures PrDetailHeader)", () => {
    // Regression guard: page.tsx used to measure PrDetailHeader with a
    // useRef + empty-deps effect, which ran once during the loading skeleton
    // (before PrDetailHeader ever mounted) and so always saw a null ref —
    // headerHeight stayed 0 forever, and RoleGroup's sticky header pinned
    // itself under PrDetailHeader instead of below it. This only asserts the
    // DiffTab → RoleGroup half of the wiring (the prop reaching the sticky
    // `top` style); the page.tsx ref-timing fix itself isn't covered by a
    // component test here and was verified manually in the browser.
    smartDiffResult = { data: SMART_DIFF, isLoading: false, isError: false };
    reviewsResult = { data: [REVIEW] };
    renderDiffTab({ headerHeight: 64 });

    expect(screen.getByRole("button", { name: /Core/ })).toHaveStyle({ top: "64px" });
  });
});
