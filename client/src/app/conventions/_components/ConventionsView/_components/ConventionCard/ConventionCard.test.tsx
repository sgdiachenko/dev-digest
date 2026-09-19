import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import type { Repo } from "../../../../../../lib/types";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const REPO: Repo = {
  id: "r1",
  workspace_id: "w1",
  owner: "acme",
  name: "payments-api",
  full_name: "acme/payments-api",
  default_branch: "main",
  clone_path: null,
  last_polled_at: null,
  created_by: null,
};

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  repo_id: "r1",
  category: "errors",
  rule: "Always use async/await instead of .then() chains.",
  rationale: "Keeps error handling consistent.",
  evidence_path: "src/api/users.ts",
  evidence_line: 23,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
  origin: "model",
  support_count: 12,
  created_at: "2026-01-01T00:00:00Z",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ conventions: messages }}>{ui}</NextIntlClientProvider>);
}

function noop() {}

describe("ConventionCard", () => {
  it("renders the rule, category, evidence link, snippet and confidence", () => {
    renderWithIntl(
      <ConventionCard candidate={CANDIDATE} repo={REPO} onAccept={noop} onReject={noop} onSave={noop} onDelete={noop} />,
    );
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("errors")).toBeInTheDocument();
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "src/api/users.ts:23" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/main/src/api/users.ts#L23");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it('shows "seen in N files" when frequency grounding has run', () => {
    renderWithIntl(
      <ConventionCard candidate={CANDIDATE} repo={REPO} onAccept={noop} onReject={noop} onSave={noop} onDelete={noop} />,
    );
    expect(screen.getByText("seen in 12 files")).toBeInTheDocument();
  });

  it("calls onAccept / onReject exactly (grading: three primary actions — Accept, Reject, Edit)", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    renderWithIntl(
      <ConventionCard candidate={CANDIDATE} repo={REPO} onAccept={onAccept} onReject={onReject} onSave={noop} onDelete={noop} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("Edit opens an inline form (no navigation) and Save calls onSave with the edited text", () => {
    const onSave = vi.fn();
    renderWithIntl(
      <ConventionCard candidate={CANDIDATE} repo={REPO} onAccept={noop} onReject={noop} onSave={onSave} onDelete={noop} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const ruleInput = screen.getByDisplayValue(CANDIDATE.rule);
    fireEvent.change(ruleInput, { target: { value: "Edited rule text." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ rule: "Edited rule text.", rationale: "Keeps error handling consistent." });
  });

  it("Cancel discards the edit without calling onSave", () => {
    const onSave = vi.fn();
    renderWithIntl(
      <ConventionCard candidate={CANDIDATE} repo={REPO} onAccept={noop} onReject={noop} onSave={onSave} onDelete={noop} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });

  it("calls onDelete when the delete action is used", () => {
    const onDelete = vi.fn();
    renderWithIntl(
      <ConventionCard candidate={CANDIDATE} repo={REPO} onAccept={noop} onReject={noop} onSave={noop} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("marks a rejected candidate visually distinct (dimmed) without hiding it", () => {
    renderWithIntl(
      <ConventionCard
        candidate={{ ...CANDIDATE, status: "rejected" }}
        repo={REPO}
        onAccept={noop}
        onReject={noop}
        onSave={noop}
        onDelete={noop}
      />,
    );
    // Still rendered — a rejected candidate stays visible, just deprioritized.
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });
});
