import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import shellMessages from "../../../../messages/en/shell.json";
import prReviewMessages from "../../../../messages/en/prReview.json";
import { DiffViewer, type DiffFindingApi, type DiffTarget } from "../index";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages, prReview: prReviewMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// Hunk header sets newNo=1; four context lines advance it to 5, where the
// added line lands — so a finding on start_line 5 is "in the diff".
const PATCH = ["@@ -1,1 +1,5 @@", " ctx1", " ctx2", " ctx3", " ctx4", "+added5"].join("\n");

const FILES: PrFile[] = [{ path: "src/config.ts", additions: 1, deletions: 0, patch: PATCH }];

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    review_id: "r1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
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

describe("DiffViewer — findings annotations", () => {
  it("shows the line label, finding card, and file dot when showFindings is on", () => {
    const findingApi: DiffFindingApi = {
      findings: [finding({})],
      showFindings: true,
      onAction: vi.fn(),
    };
    renderWithIntl(<DiffViewer files={FILES} findings={findingApi} />);

    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByLabelText("This file has findings")).toBeInTheDocument();
  });

  it("hides finding cards (but keeps the dot) when showFindings is off", () => {
    const findingApi: DiffFindingApi = {
      findings: [finding({})],
      showFindings: false,
      onAction: vi.fn(),
    };
    renderWithIntl(<DiffViewer files={FILES} findings={findingApi} />);

    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getByLabelText("This file has findings")).toBeInTheDocument();
  });

  it("renders a finding whose start_line isn't in the patch inside the outside-diff block", () => {
    const findingApi: DiffFindingApi = {
      findings: [finding({ id: "f-outside", start_line: 999, title: "Stale finding" })],
      showFindings: true,
      onAction: vi.fn(),
    };
    renderWithIntl(<DiffViewer files={FILES} findings={findingApi} />);

    expect(screen.getByText("1 finding(s) outside the diff")).toBeInTheDocument();
    expect(screen.getByText("Stale finding")).toBeInTheDocument();
  });
});

describe("DiffViewer — navigation target", () => {
  // 250 changed lines: collapsed by default (> AUTO_EXPAND_MAX_LINES). The
  // added line lands on new-side line 5.
  const BIG: PrFile[] = [{ path: "src/big.ts", additions: 250, deletions: 0, patch: PATCH }];

  function target(o: Partial<DiffTarget> = {}): DiffTarget {
    return {
      path: "src/big.ts",
      line: 5,
      key: "src/big.ts#5",
      lineNotInDiffLabel: "Line 5 isn't part of this diff",
      highlighted: false,
      onApplied: vi.fn(),
      ...o,
    };
  }

  it("keeps a file over 200 changed lines collapsed without a target", () => {
    renderWithIntl(<DiffViewer files={BIG} />);
    expect(screen.queryByText("added5")).not.toBeInTheDocument();
  });

  it("expands a collapsed card for the target and hands the rendered line to onApplied", () => {
    const t = target();
    renderWithIntl(<DiffViewer files={BIG} target={t} />);

    expect(screen.getByText("added5")).toBeInTheDocument();
    const el = (t.onApplied as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as HTMLElement;
    expect(el.getAttribute("data-new-line")).toBe("5");
    expect(el.getAttribute("tabindex")).toBe("-1");
    expect(screen.queryByText("Line 5 isn't part of this diff")).not.toBeInTheDocument();
  });

  it("highlights only the target line while highlighted is on", () => {
    const { rerender } = renderWithIntl(<DiffViewer files={BIG} target={target({ highlighted: true })} />);
    const row = () => screen.getByText("added5").parentElement as HTMLElement;
    expect(row().style.outline).toContain("solid");

    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages, prReview: prReviewMessages }}>
        <DiffViewer files={BIG} target={target({ highlighted: false })} />
      </NextIntlClientProvider>,
    );
    expect(row().style.outline).toBe("");
  });

  it("fades the highlight only when reduced motion is not requested (AC-92)", () => {
    const mm = (reduce: boolean) =>
      vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q }));
    const row = () => screen.getByText("added5").parentElement as HTMLElement;

    mm(true);
    renderWithIntl(<DiffViewer files={BIG} target={target({ highlighted: true })} />);
    expect(row().style.outline).toContain("solid");
    expect(row().style.transition).toBe("");
    cleanup();

    mm(false);
    renderWithIntl(<DiffViewer files={BIG} target={target({ highlighted: true })} />);
    expect(row().style.transition).toContain("background");
    vi.unstubAllGlobals();
  });

  it("labels the header and targets it when the line is not part of the diff", () => {
    const t = target({ line: 99, key: "src/big.ts#99", lineNotInDiffLabel: "Line 99 isn't part of this diff" });
    renderWithIntl(<DiffViewer files={BIG} target={t} />);

    expect(screen.getByText("Line 99 isn't part of this diff")).toBeInTheDocument();
    const el = (t.onApplied as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as HTMLElement;
    expect(el.getAttribute("data-diff-file")).toBe("src/big.ts");
    expect(el.getAttribute("tabindex")).toBe("-1");
  });

  it("targets the file header when no line is given, and ignores other files", () => {
    const other: PrFile = { path: "src/other.ts", additions: 1, deletions: 0, patch: PATCH };
    const t = target({ line: null, key: "src/big.ts#" });
    renderWithIntl(<DiffViewer files={[other, ...BIG]} target={t} />);

    const el = (t.onApplied as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as HTMLElement;
    expect(el.getAttribute("data-diff-file")).toBe("src/big.ts");
    expect(screen.queryByText(/isn't part of this diff/)).not.toBeInTheDocument();
  });
});
