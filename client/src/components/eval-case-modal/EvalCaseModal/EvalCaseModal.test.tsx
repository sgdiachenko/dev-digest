import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAttempt, EvalCase, EvalCaseDraft, EvalCaseResult, EvalExpectation } from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import { EvalCaseModal, type EvalCaseSource } from "./EvalCaseModal";

const DIFF = [
  "diff --git a/src/config.ts b/src/config.ts",
  "--- a/src/config.ts",
  "+++ b/src/config.ts",
  "@@ -10,6 +10,7 @@",
  " export const config = {",
  '+  stripeKey: "sk_live_x",',
  " };",
].join("\n");

const EXP: EvalExpectation = {
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded key",
};

const DRAFT: EvalCaseDraft = {
  name: "must-find-stripe-key",
  type: "must_find",
  input_diff: DIFF,
  input_meta: { pr_title: "Add stripe", pr_body: null, pr_number: 7, repo_full_name: "acme/pay" },
  expectations: [EXP],
  source_finding_id: "f1",
  diff_source: "run_trace",
  notes: null,
  owner_id: "ag1",
  owner_name: "Security Reviewer",
  existing_case: null,
};

const FINDING = {
  id: "x1",
  severity: "CRITICAL" as const,
  category: "security" as const,
  title: "Hardcoded key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding" as const,
  trifecta_components: null,
  evidence: null,
};

function result(over: Partial<EvalCaseResult> = {}): EvalCaseResult {
  return {
    case_id: null,
    case_name: "must-find-stripe-key",
    status: "pass",
    error_reason: null,
    actual_findings: [{ ...FINDING, match: "matched" }],
    dropped_findings: [],
    expected_count: 1,
    actual_count: 1,
    duration_ms: 1800,
    cost_usd: null,
    ...over,
  };
}

function attempt(res: EvalCaseResult | null, status: EvalAttempt["status"] = "done"): EvalAttempt {
  return { attempt_id: "a1", status, started_at: "2026-10-08T10:00:00Z", result: res };
}

type Reply = { status?: number; body?: unknown };
type Routes = Record<string, Reply | (() => Reply)>;
const calls: { method: string; path: string; body: unknown }[] = [];

function mockFetch(routes: Routes) {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const hit = routes[`${method} ${path}`];
      const reply = typeof hit === "function" ? hit() : hit;
      const status = reply?.status ?? (reply ? 200 : 404);
      return {
        ok: status < 400,
        status,
        statusText: "x",
        json: async () => reply?.body ?? { error: { code: "not_found", message: "not found" } },
      } as unknown as Response;
    }),
  );
}

const posts = (path: string) => calls.filter((c) => c.method !== "GET" && c.path === path);

function renderModal(source: EvalCaseSource, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (src: EvalCaseSource) => (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <EvalCaseModal source={src} onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(ui(source));
  return { onClose, ...view, ui };
}

const FINDING_SRC: EvalCaseSource = { kind: "finding", findingId: "f1" };
const DRAFT_ROUTE = "GET /findings/f1/eval-draft";
const START = "POST /agents/ag1/eval-attempts";
const ATTEMPT = "GET /eval-attempts/a1";

async function ready() {
  await screen.findByRole("dialog");
  await screen.findByLabelText("Name");
}

async function runCase() {
  fireEvent.click(screen.getByRole("button", { name: "Run case" }));
  await screen.findByText(/Last run (passed|failed)/);
}

beforeEach(() => mockFetch({}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EvalCaseModal", () => {
  it("shows the draft, runs it, then saves once and closes (AC-36, 37, 5, 41, 43, 53, 155)", async () => {
    mockFetch({
      [DRAFT_ROUTE]: { body: DRAFT },
      [START]: { status: 202, body: { attempt_id: "a1" } },
      [ATTEMPT]: { body: attempt(result()) },
      "POST /agents/ag1/eval-cases": { status: 201, body: {} },
    });
    const { onClose } = renderModal(FINDING_SRC);
    await ready();

    expect(screen.getByText("Eval case · must-find-stripe-key")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer · simulate a PR and assert the expected output")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Security Reviewer")).toBeNull(); // read-only text, not a field
    expect(screen.getByText("Positive case")).toBeInTheDocument();
    expect(screen.getByTestId("case-banner")).toHaveTextContent("MUST find ‘Hardcoded key’ at src/config.ts:11");
    expect(screen.getByLabelText("Name")).toHaveValue("must-find-stripe-key");
    expect(screen.getByRole("button", { name: "Diff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PR meta" })).toBeInTheDocument();
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(screen.getByLabelText("Diff fragment")).toHaveValue(DIFF);
    expect(posts("/agents/ag1/eval-cases")).toHaveLength(0); // opening persists nothing
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Run the case first")).toBeInTheDocument();

    await runCase();
    expect(posts("/agents/ag1/eval-attempts")[0]!.body).toMatchObject({ name: "must-find-stripe-key", diff_source: "run_trace" });
    expect(screen.getByRole("status")).toHaveTextContent(/Last run passed · expected 1, got 1 · 1\.8s · —/);
    expect(screen.getByText("matched")).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(posts("/agents/ag1/eval-cases")).toHaveLength(1);
    expect(posts("/agents/ag1/eval-cases")[0]!.body).toMatchObject({ source_finding_id: "f1", type: "must_find" });
  });

  it("marks a result outdated after an edit and keeps Save enabled on a failed run (AC-44, 45, 42)", async () => {
    mockFetch({
      [DRAFT_ROUTE]: { body: DRAFT },
      [START]: { body: { attempt_id: "a1" } },
      [ATTEMPT]: {
        body: attempt(
          result({
            status: "fail",
            actual_findings: [
              { ...FINDING, title: "Other", match: "unmatched" },
              { ...FINDING, title: "Forbidden one", match: "forbidden_hit" },
            ],
            dropped_findings: [{ finding: { ...FINDING, title: "Ghost" }, reason: "line not in diff" }],
            actual_count: 2,
            cost_usd: 0.0213,
          }),
        ),
      },
    });
    renderModal(FINDING_SRC);
    await ready();
    await runCase();

    expect(screen.getByText(/Last run failed/)).toBeInTheDocument();
    expect(screen.getByText("unmatched")).toBeInTheDocument();
    expect(screen.getByText("forbidden hit")).toBeInTheDocument();
    expect(screen.getByText(/line not in diff/)).toBeInTheDocument();
    expect(screen.getByText("Ghost")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0.021 USD");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Diff fragment"), { target: { value: DIFF + "\n" } });
    expect(screen.getByText("Outdated — run again")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("flags invalid expected JSON next to the field and blocks Run and Save (AC-145, 146)", async () => {
    mockFetch({ [DRAFT_ROUTE]: { body: DRAFT } });
    renderModal(FINDING_SRC);
    await ready();

    const field = screen.getByLabelText("Expected output");
    fireEvent.change(field, { target: { value: "{oops" } });
    expect(screen.getByText("invalid")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Expected output is not valid JSON");
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(field, { target: { value: JSON.stringify([{ ...EXP, file: "src/other.ts" }]) } });
    expect(field).toHaveAccessibleDescription("File src/other.ts is not in the diff fragment");
  });

  it("shows progress with seconds in a status region while the attempt runs (AC-147, NFR-11)", async () => {
    mockFetch({
      [DRAFT_ROUTE]: { body: DRAFT },
      [START]: { body: { attempt_id: "a1" } },
      [ATTEMPT]: { body: attempt(null, "running") },
    });
    renderModal(FINDING_SRC);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));

    expect(await screen.findByText("Running… 0s")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(await screen.findByText("Running… 1s", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(); // AC-148
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
  });

  it("drops the result when the modal is closed mid-run and reopened (AC-56)", async () => {
    mockFetch({
      [DRAFT_ROUTE]: { body: DRAFT },
      [START]: { body: { attempt_id: "a1" } },
      [ATTEMPT]: { body: attempt(null, "running") },
    });
    const first = renderModal(FINDING_SRC);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    await screen.findByText(/Running…/);
    first.unmount();

    mockFetch({ [DRAFT_ROUTE]: { body: DRAFT }, [ATTEMPT]: { body: attempt(result()) } });
    renderModal(FINDING_SRC);
    await ready();
    expect(screen.queryByText(/Last run/)).toBeNull();
    expect(screen.getByText("Not run yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows the reason of a failed run, with a link to API keys for a missing key (AC-149, 150)", async () => {
    mockFetch({
      [DRAFT_ROUTE]: { body: DRAFT },
      [START]: { body: { attempt_id: "a1" } },
      [ATTEMPT]: { body: attempt(result({ status: "error", error_reason: "missing_key", actual_findings: [] }), "error") },
    });
    renderModal(FINDING_SRC);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));

    expect(await screen.findByText("No API key is set for this agent’s provider.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings › API keys" })).toHaveAttribute("href", "/settings/api-keys");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(); // an error result is still a finished run
  });

  it("reports an interrupted run when the attempt is gone and keeps Save disabled (AC-159, 160)", async () => {
    mockFetch({
      [DRAFT_ROUTE]: { body: DRAFT },
      [START]: { body: { attempt_id: "a1" } },
      [ATTEMPT]: { status: 404, body: { error: { code: "attempt_not_found", message: "gone" } } },
    });
    renderModal(FINDING_SRC);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));

    expect((await screen.findAllByText("Run interrupted — run again")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows the server reason and disables Run and Save when no diff is available (AC-143, 144)", async () => {
    mockFetch({
      [DRAFT_ROUTE]: {
        status: 422,
        body: { error: { code: "diff_unavailable", message: "No diff is available for this finding’s lines" } },
      },
    });
    renderModal(FINDING_SRC);

    expect(await screen.findByRole("alert")).toHaveTextContent("No diff is available for this finding’s lines");
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("warns about the PR diff source and a duplicate case without blocking Save (AC-13, 153, 154)", async () => {
    mockFetch({
      [DRAFT_ROUTE]: {
        body: { ...DRAFT, diff_source: "current_pr_files", existing_case: { id: "c9", name: "older-case" } },
      },
      [START]: { body: { attempt_id: "a1" } },
      [ATTEMPT]: { body: attempt(result()) },
    });
    renderModal(FINDING_SRC);
    await ready();

    expect(screen.getByText(/Built from the current PR diff/)).toBeInTheDocument();
    expect(screen.getByText("A case from this finding already exists: older-case")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open older-case" })).toHaveAttribute("href", "/agents/ag1?tab=evals");
    await runCase();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("keeps the draft and flags the name on 409 name_taken (AC-157, 158)", async () => {
    mockFetch({
      [DRAFT_ROUTE]: { body: DRAFT },
      [START]: { body: { attempt_id: "a1" } },
      [ATTEMPT]: { body: attempt(result()) },
      "POST /agents/ag1/eval-cases": { status: 409, body: { error: { code: "name_taken", message: "taken" } } },
    });
    const { onClose } = renderModal(FINDING_SRC);
    await ready();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "my-name" } });
    await runCase();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const name = screen.getByLabelText("Name");
    await waitFor(() => expect(name).toHaveAccessibleDescription("A case with this name already exists for this agent"));
    expect(name).toHaveValue("my-name");
    expect(screen.getByLabelText("Diff fragment")).toHaveValue(DIFF);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("cancels without writing; asks to discard only after a change (AC-54, 55)", async () => {
    mockFetch({ [DRAFT_ROUTE]: { body: DRAFT } });
    const { onClose } = renderModal(FINDING_SRC);
    await ready();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveTextContent("Discard this draft?");
    fireEvent.click(within(confirm).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("closes a clean modal with Escape and keeps a keyboard path Run -> Save inside it (NFR-9, NFR-10)", async () => {
    mockFetch({ [DRAFT_ROUTE]: { body: DRAFT } });
    const { onClose } = renderModal(FINDING_SRC);
    await ready();

    const dialog = screen.getByRole("dialog");
    const run = screen.getByRole("button", { name: "Run case" });
    run.focus();
    expect(run).toHaveFocus();
    expect(run.tagName).toBe("BUTTON");
    expect(dialog).toContainElement(run);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("edits a saved case with PUT (AC-62) and gives a long name a title and focus (AC-118)", async () => {
    const longName = "a-very-long-case-name-".repeat(5);
    const saved: EvalCase = {
      id: "c1",
      name: longName,
      type: "must_find",
      input_diff: DIFF,
      input_meta: { pr_title: "T", pr_body: null, pr_number: null, repo_full_name: null },
      expectations: [EXP],
      source_finding_id: null,
      diff_source: "manual",
      notes: null,
      owner_kind: "agent",
      owner_id: "ag1",
      created_at: "",
      updated_at: "",
      last_result: null,
      source: null,
    };
    mockFetch({
      "POST /agents/ag1/eval-attempts": { body: { attempt_id: "a1" } },
      [ATTEMPT]: { body: attempt(result()) },
      "PUT /eval-cases/c1": { body: saved },
    });
    const { onClose } = renderModal({ kind: "case", evalCase: saved, agentName: "Security Reviewer" });

    const name = screen.getByLabelText("Name");
    expect(name).toHaveAttribute("title", longName);
    name.focus();
    expect(name).toHaveFocus();
    await runCase();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts("/eval-cases/c1")[0]).toMatchObject({ method: "PUT", body: { name: longName } });
  });

  it("creates a manual case with diff_source manual (AC-71)", async () => {
    mockFetch({
      "POST /agents/ag1/eval-attempts": { body: { attempt_id: "a1" } },
      [ATTEMPT]: { body: attempt(result()) },
      "POST /agents/ag1/eval-cases": { status: 201, body: {} },
    });
    const { onClose } = renderModal({ kind: "manual", agentId: "ag1", agentName: "Security Reviewer" });

    expect(screen.getByText("New eval case")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "manual-case" } });
    fireEvent.change(screen.getByLabelText("Diff fragment"), { target: { value: DIFF } });
    fireEvent.change(screen.getByLabelText("Expected output"), { target: { value: JSON.stringify([EXP]) } });
    await runCase();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts("/agents/ag1/eval-cases")[0]!.body).toMatchObject({ diff_source: "manual", name: "manual-case" });
  });
});
