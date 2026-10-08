import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard — Turn into eval case (T36)", () => {
  it("renders the button after Accept and Dismiss only when a callback is passed (AC-3, C20)", () => {
    const { unmount } = renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: /Turn into eval case/ })).toBeNull();
    unmount();

    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} onTurnIntoEvalCase={() => {}} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent?.trim());
    const accept = labels.indexOf("Accept");
    const dismiss = labels.indexOf("Dismiss");
    const evalIdx = labels.indexOf("Turn into eval case");
    expect(evalIdx).toBeGreaterThan(Math.max(accept, dismiss));
    expect(screen.queryByRole("button", { name: "Learn" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reply to author" })).toBeNull();
  });

  it("is disabled with the reason as title and accessible description (AC-1, AC-4)", () => {
    const onTurn = vi.fn();
    renderWithIntl(
      <FindingCard
        f={FINDING}
        defaultExpanded
        onTurnIntoEvalCase={onTurn}
        evalDisabledReason="Accept or dismiss this finding first"
      />,
    );
    const btn = screen.getByRole("button", { name: /Turn into eval case/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Accept or dismiss this finding first");
    expect(btn).toHaveAccessibleDescription("Accept or dismiss this finding first");
    fireEvent.click(btn);
    expect(onTurn).not.toHaveBeenCalled();
  });

  it("stays enabled on a muted dismissed card and calls back on click (AC-2)", () => {
    const onTurn = vi.fn();
    renderWithIntl(
      <FindingCard
        f={{ ...FINDING, dismissed_at: "2026-10-08T00:00:00Z" }}
        defaultExpanded
        onTurnIntoEvalCase={onTurn}
        evalDisabledReason={null}
      />,
    );
    const btn = screen.getByRole("button", { name: /Turn into eval case/ });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onTurn).toHaveBeenCalledTimes(1);
  });
});
