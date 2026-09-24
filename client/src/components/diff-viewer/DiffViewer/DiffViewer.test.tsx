import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import shellMessages from "../../../../messages/en/shell.json";
import prReviewMessages from "../../../../messages/en/prReview.json";
import { DiffViewer, type DiffFindingApi } from "../index";

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
