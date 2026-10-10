import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { CiRun } from "@devdigest/shared";
import ciMessages from "../../../../../messages/en/ci.json";
import { CiRunsView } from "./CiRunsView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ crumb, children }: { crumb: { label: string }[]; children: React.ReactNode }) => (
    <div>
      <div data-testid="crumb">{crumb.map((c) => c.label).join(" › ")}</div>
      {children}
    </div>
  ),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

function makeRun(over: Partial<CiRun> = {}): CiRun {
  return {
    id: "run1",
    ci_installation_id: "i1",
    repo: "acme/payments-api",
    pr_number: 482,
    head_sha: "0123456789abcdef0123456789abcdef01234567",
    workflow_run_id: 9001,
    run_attempt: 1,
    ran_at: "2026-10-09T14:05:30Z",
    duration_s: 42,
    status: "succeeded",
    verdict: "comment",
    findings_count: 3,
    critical: 1,
    warning: 1,
    suggestion: 1,
    cost_usd: 0.06,
    agent: "Security Reviewer",
    agent_version: 3,
    github_url: "https://github.com/acme/payments-api/actions/runs/9001",
    source: "gha",
    unavailable_reason: null,
    model: "m",
    ci_fail_on: "critical",
    skills: [],
    memory_sha256: null,
    manifest_sha256: "a".repeat(64),
    runner_build: "b".repeat(64),
    differs_from_export: false,
    ...over,
  };
}

function routeFetch(opts: { runs: () => Promise<Response>; refresh?: () => Promise<Response> }) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
    if (key === "GET /ci-runs") return opts.runs();
    if (key === "POST /ci-runs/refresh" && opts.refresh) return opts.refresh();
    throw new Error(`unrouted request: ${key}`);
  });
}

function renderView() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <CiRunsView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
});
afterEach(cleanup);

/** The cell texts of a body row, in column order. */
function cells(row: HTMLElement) {
  return within(row).getAllByRole("cell");
}
const bodyRows = () => screen.getAllByRole("row").slice(1);

describe("rows (AC-79, AC-80)", () => {
  it("shows the page header and one row with every column, linked PR and run", async () => {
    routeFetch({ runs: () => json([makeRun()]) });
    renderView();

    expect(screen.getByTestId("crumb")).toHaveTextContent("Skills Lab › CI Runs");
    expect(screen.getByRole("heading", { name: "CI Runs" })).toBeInTheDocument();
    expect(screen.queryByText("auto-refresh on")).toBeNull();

    const [row] = await waitFor(() => {
      const r = bodyRows();
      expect(r).toHaveLength(1);
      return r;
    });
    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/ci-runs\?limit=100$/);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Timestamp", "Pull request", "Agent", "Source", "Dur.", "Findings", "Cost", "Verdict", "Status", "GitHub",
    ]);

    const [when, pr, agent, source, duration, findings, cost, verdict, status, link] = cells(row!);
    expect(when).toHaveTextContent("2026-10-09 14:05");
    expect(within(when!).getByTitle("acme/payments-api")).toHaveTextContent("acme/payments-api");
    expect(within(pr!).getByRole("link", { name: "#482" })).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/482");
    expect(pr).toHaveTextContent("0123456");
    expect(agent).toHaveTextContent("Security Reviewer v3");
    expect(source).toHaveTextContent("GitHub Actions");
    expect(duration).toHaveTextContent("42s");
    expect(findings).toHaveTextContent(/1\s*1\s*1/);
    expect(within(findings!).getByTitle("Critical")).toHaveTextContent("1");
    expect(cost).toHaveTextContent("$0.06");
    expect(verdict).toHaveTextContent("Comment");
    expect(status).toHaveTextContent("Succeeded");
    expect(within(link!).getByRole("link", { name: /View on GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/actions/runs/9001",
    );
  });

  it("shows the empty state with an action that opens the agents list (AC-81)", async () => {
    routeFetch({ runs: () => json([]) });
    renderView();

    expect(await screen.findByText("No CI runs yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set up CI for an agent" }));
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("shows a skeleton while loading and an error with Retry on failure", async () => {
    let attempt = 0;
    routeFetch({ runs: () => (++attempt === 1 ? json({ error: { code: "x", message: "x" } }, 500) : json([makeRun()])) });
    renderView();

    expect(screen.getByLabelText("Loading CI runs")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("Couldn’t load CI runs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
  });
});

describe("missing data (AC-94, AC-100, AC-115, AC-101)", () => {
  it("shows — with the stored reason, 'unlinked' with the short SHA, and — for a deleted agent", async () => {
    routeFetch({
      runs: () =>
        json([
          makeRun({
            status: "failed",
            pr_number: null,
            agent: null,
            agent_version: null,
            duration_s: null,
            verdict: null,
            findings_count: null,
            critical: null,
            warning: null,
            suggestion: null,
            cost_usd: null,
            unavailable_reason: "artifact_expired",
            repo: "acme/" + "very-long-repository-name-".repeat(4),
          }),
        ]),
    });
    renderView();

    const [row] = await waitFor(() => {
      const r = bodyRows();
      expect(r).toHaveLength(1);
      return r;
    });
    const [when, pr, agent, , duration, findings, cost, verdict, status] = cells(row!);
    expect(pr).toHaveTextContent("unlinked");
    expect(pr).toHaveTextContent("0123456");
    expect(within(pr!).queryByRole("link")).toBeNull();
    expect(agent).toHaveTextContent("—");
    expect(duration).toHaveTextContent("—");
    expect(findings).toHaveTextContent("—");
    expect(findings).toHaveTextContent("Artifact expired");
    expect(cost).toHaveTextContent("—");
    expect(verdict).toHaveTextContent("—");
    expect(status).toHaveTextContent("Failed");
    const longRepo = "acme/" + "very-long-repository-name-".repeat(4);
    expect(within(when!).getByTitle(longRepo)).toHaveTextContent(longRepo);
  });

  it("shows zero counts as numbers, not as unavailable", async () => {
    routeFetch({ runs: () => json([makeRun({ status: "no_findings", findings_count: 0, critical: 0, warning: 0, suggestion: 0 })]) });
    renderView();
    const [row] = await waitFor(() => {
      const r = bodyRows();
      expect(r).toHaveLength(1);
      return r;
    });
    expect(cells(row!)[5]).not.toHaveTextContent("—");
    expect(cells(row!)[8]).toHaveTextContent("No findings");
  });
});

describe("'differs from export' marker (AC-180, AC-182)", () => {
  it("is shown when the run differs and a manifest hash exists, otherwise hidden", async () => {
    routeFetch({
      runs: () =>
        json([
          makeRun({ id: "a", differs_from_export: true }),
          makeRun({ id: "b", differs_from_export: false }),
          makeRun({ id: "c", differs_from_export: true, manifest_sha256: null }),
        ]),
    });
    renderView();
    await waitFor(() => expect(bodyRows()).toHaveLength(3));

    const [a, b, c] = bodyRows();
    expect(within(a!).getByText("differs from export")).toBeInTheDocument();
    expect(within(b!).queryByText("differs from export")).toBeNull();
    expect(within(c!).queryByText("differs from export")).toBeNull();
  });
});

describe("Refresh (AC-82, AC-83, AC-97, AC-102)", () => {
  it("announces the Refresh result in an aria-live=polite status region (NFR-8)", async () => {
    routeFetch({ runs: () => json([makeRun()]), refresh: () => json([]) });
    renderView();
    await screen.findByRole("button", { name: "Refresh" });
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region.getAttribute("aria-live")).not.toBe("assertive");
  });

  it("disables Refresh as 'Refreshing…' keeping the rows, then reloads and lists per-repo errors", async () => {
    let release!: (r: Response) => void;
    let listCalls = 0;
    routeFetch({
      runs: () => (++listCalls === 1 ? json([makeRun()]) : json([makeRun(), makeRun({ id: "run2", workflow_run_id: 9002 })])),
      refresh: () => new Promise<Response>((r) => (release = r)),
    });
    renderView();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const busy = await screen.findByRole("button", { name: "Refreshing…" });
    expect(busy).toBeDisabled();
    expect(bodyRows()).toHaveLength(1);

    release(
      new Response(
        JSON.stringify({
          results: [
            { installation_id: "i1", repo: "acme/payments-api", stored: 1, error_code: null },
            { installation_id: "i2", repo: "acme/billing-worker", stored: 0, error_code: "repo_not_accessible" },
            { installation_id: "i3", repo: "acme/legacy", stored: 0, error_code: "github_scope_missing" },
          ],
        }),
        { status: 200 },
      ),
    );
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();

    const failures = within(screen.getByRole("list", { name: "Repositories that failed to refresh" })).getAllByRole("listitem");
    expect(failures).toHaveLength(2);
    expect(failures[0]).toHaveTextContent("acme/billing-worker The repository does not exist or the token cannot access it.");
    expect(failures[1]).toHaveTextContent("acme/legacy");
    expect(failures[1]).toHaveTextContent("Actions: read");
    expect(within(failures[1]!).getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/api-keys");
  });

  it("explains that a GitHub token is required, with a Settings link, when none is configured", async () => {
    routeFetch({
      runs: () => json([makeRun()]),
      refresh: () => json({ error: { code: "github_token_missing", message: "no token" } }, 400),
    });
    renderView();
    await waitFor(() => expect(bodyRows()).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/A GitHub token is required to refresh CI runs/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/api-keys");
    expect(bodyRows()).toHaveLength(1);
  });
});
