import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { CiTab } from "./CiTab";
import {
  apiError,
  bodyOf,
  callsTo,
  exportResponse,
  fetchMock,
  json,
  makeAgent,
  makeInstallation,
  makeRepo,
  makeRun,
  renderWithProviders,
  routeFetch,
} from "./testing";

vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});
afterEach(cleanup);

const LIST = "GET /agents/ag1/ci-installations";

describe("empty state and wizard entry (AC-1, AC-68)", () => {
  it("shows 'Not in CI yet' and opens the wizard at the Target step from 'Add to CI'", async () => {
    routeFetch({ [LIST]: () => json([]), "GET /repos": () => json([makeRepo("acme/payments-api")]) });
    renderWithProviders(<CiTab agent={makeAgent()} />);

    expect(await screen.findByText("Not in CI yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to CI" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Export to CI")).toBeInTheDocument();
    expect(within(dialog).getByText("GitHub Actions")).toBeInTheDocument();
    expect(await within(dialog).findByLabelText("Target repository")).toBeInTheDocument();
  });
});

describe("loading and load error (Q-22h)", () => {
  it("shows a skeleton while loading, then an error with Retry that reloads", async () => {
    let attempt = 0;
    routeFetch({
      [LIST]: () => (++attempt === 1 ? apiError(500, "boom", "boom") : json([makeInstallation()])),
    });
    renderWithProviders(<CiTab agent={makeAgent()} />);

    expect(screen.getByLabelText("Loading CI installations")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("Couldn’t load CI installations")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("acme/payments-api")).toBeInTheDocument();
    expect(attempt).toBe(2);
  });
});

describe("installation rows (AC-69, AC-70, AC-75, AC-76)", () => {
  it("lists repo, badge, PR link, latest run and flags; an up-to-date row has no flags", async () => {
    routeFetch({
      [LIST]: () =>
        json([
          makeInstallation({
            id: "i1",
            agent_version: 1,
            ci_fail_on: "warning",
            latest_run: makeRun({ status: "failed" }),
          }),
          makeInstallation({ id: "i2", repo: "acme/billing-worker", pr_url: null }),
        ]),
    });
    renderWithProviders(<CiTab agent={makeAgent({ version: 3, ci_fail_on: "critical" })} />);

    expect(await screen.findByText("Installed in 2 repos")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    const [first, second] = rows as [HTMLElement, HTMLElement];

    expect(within(first).getByText("acme/payments-api")).toBeInTheDocument();
    expect(within(first).getByText("GitHub Actions")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: /Setup PR/ })).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/7");
    expect(within(first).getByText("Failed")).toBeInTheDocument();
    expect(within(first).getByText("4 minutes ago")).toBeInTheDocument();
    expect(within(first).getByText("outdated")).toBeInTheDocument();
    expect(within(first).getByText("pending update")).toBeInTheDocument();

    expect(within(second).getByText("acme/billing-worker")).toBeInTheDocument();
    expect(within(second).getByText("No runs yet")).toBeInTheDocument();
    expect(within(second).queryByText("outdated")).toBeNull();
    expect(within(second).queryByText("pending update")).toBeNull();
    expect(within(second).queryByRole("link")).toBeNull();
  });

  it("uses the singular for one repository", async () => {
    routeFetch({ [LIST]: () => json([makeInstallation()]) });
    renderWithProviders(<CiTab agent={makeAgent()} />);
    expect(await screen.findByText("Installed in 1 repo")).toBeInTheDocument();
  });
});

describe("Fail CI on (AC-71–AC-74)", () => {
  it("selects the stored value and saves another through the agent update route", async () => {
    routeFetch({
      [LIST]: () => json([makeInstallation()]),
      "PUT /agents/ag1": () => json(makeAgent({ ci_fail_on: "never" })),
    });
    renderWithProviders(<CiTab agent={makeAgent({ ci_fail_on: "critical" })} />);
    await screen.findByText("Installed in 1 repo");

    expect(screen.getByRole("radio", { name: "Critical" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Never" })).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("radio", { name: "Never" }));
    await waitFor(() => expect(callsTo("PUT /agents/ag1")).toHaveLength(1));
    expect(bodyOf(callsTo("PUT /agents/ag1")[0]!)).toEqual({ ci_fail_on: "never" });
  });

  it("restores the previous selection and shows the reason when the save fails", async () => {
    routeFetch({
      [LIST]: () => json([makeInstallation()]),
      "PUT /agents/ag1": () => apiError(500, "internal", "Database is down"),
    });
    renderWithProviders(<CiTab agent={makeAgent({ ci_fail_on: "critical" })} />);
    await screen.findByText("Installed in 1 repo");

    fireEvent.click(screen.getByRole("radio", { name: "Warning +" }));
    expect(await screen.findByText("Couldn’t save: Database is down")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Critical" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Warning +" })).toHaveAttribute("aria-checked", "false");
  });

  it("selects no option and shows the note when the stored value is 'any'", async () => {
    routeFetch({ [LIST]: () => json([makeInstallation({ ci_fail_on: "any" })]) });
    renderWithProviders(<CiTab agent={makeAgent({ ci_fail_on: "any" })} />);
    await screen.findByText("Installed in 1 repo");

    expect(screen.getByText("Any finding (set on the Config tab)")).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toHaveAttribute("aria-checked", "false");
  });
});

describe("Update CI config (AC-77, AC-78, AC-134)", () => {
  it("re-runs the PR install per installation with its stored settings and lists each repo's result", async () => {
    routeFetch({
      [LIST]: () =>
        json([
          makeInstallation({ id: "i1", repo: "acme/payments-api", post_as: "pr_comment", triggers: ["opened"] }),
          makeInstallation({ id: "i2", repo: "acme/billing-worker" }),
        ]),
      "POST /agents/ag1/export-ci": (init) => {
        const body = JSON.parse(String(init!.body));
        return body.repo === "acme/billing-worker"
          ? apiError(403, "github_scope_missing", "Token lacks the workflow permission")
          : json(exportResponse({ pr_url: "https://github.com/acme/payments-api/pull/9", pr_number: 9 }));
      },
    });
    renderWithProviders(<CiTab agent={makeAgent()} />);
    await screen.findByText("Installed in 2 repos");

    fireEvent.click(screen.getByRole("button", { name: "Update CI config" }));

    expect(await screen.findByText("Failed: Token lacks the workflow permission")).toBeInTheDocument();
    const bodies = callsTo("POST /agents/ag1/export-ci").map(bodyOf);
    expect(bodies).toContainEqual({ repo: "acme/payments-api", target: "gha", action: "open_pr", post_as: "pr_comment", triggers: ["opened"] });
    expect(bodies).toHaveLength(2);

    const results = screen.getByRole("list", { name: "Update CI config results" });
    const [ok, failed] = within(results).getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(within(ok).getByText("Updated.")).toBeInTheDocument();
    expect(within(ok).getByRole("link", { name: "Setup PR" })).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/9");
    expect(within(failed).getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/api-keys");
  });
});
