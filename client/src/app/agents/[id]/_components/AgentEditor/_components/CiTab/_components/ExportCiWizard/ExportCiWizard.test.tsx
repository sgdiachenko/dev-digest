import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { unzipSync, strFromU8 } from "fflate";
import { ExportCiWizard } from "./ExportCiWizard";
import {
  apiError,
  BUNDLE_FILES,
  bodyOf,
  callsTo,
  exportResponse,
  fetchMock,
  json,
  makeAgent,
  makeRepo,
  renderWithProviders,
  routeFetch,
} from "../../testing";

vi.stubGlobal("fetch", fetchMock);
const downloadZip = vi.fn();
vi.mock("./download", () => ({ downloadZip: (...args: unknown[]) => downloadZip(...args) }));

const EXPORT = "POST /agents/ag1/export-ci";
const WORKFLOW = ".github/workflows/devdigest-review.yml";

beforeEach(() => {
  fetchMock.mockReset();
  downloadZip.mockReset();
});
afterEach(cleanup);

function renderWizard(over: Parameters<typeof makeAgent>[0] = {}, onClose = vi.fn()) {
  renderWithProviders(<ExportCiWizard agent={makeAgent(over)} onClose={onClose} />);
  return onClose;
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** Target → Configure → Preview with the default choices. */
async function toPreview() {
  await screen.findByLabelText("Target repository");
  click("Continue");
  click("Continue");
  await screen.findByLabelText(`Edit workflow: ${WORKFLOW}`);
}

const repos = () => json([makeRepo("acme/payments-api"), makeRepo("acme/billing-worker")]);

describe("Target and Configure (AC-2–AC-9)", () => {
  it("lists the steps in order, offers only GitHub Actions and the imported repos", async () => {
    routeFetch({ "GET /repos": repos });
    renderWizard();
    await screen.findByLabelText("Target repository");

    const text = screen.getByRole("dialog").textContent!;
    const order = ["Target", "Configure", "Preview", "Install"].map((label) => text.indexOf(label));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);

    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /GitHub Actions/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["acme/payments-api", "acme/billing-worker"]);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("blocks Continue with a link to the repositories page when nothing is imported", async () => {
    routeFetch({ "GET /repos": () => json([]) });
    renderWizard();

    expect(await screen.findByText(/Import a repository first/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to repositories" })).toHaveAttribute("href", "/onboarding");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("blocks Continue when the agent's provider is not OpenRouter", async () => {
    routeFetch({ "GET /repos": repos });
    renderWizard({ provider: "openai" });

    expect(await screen.findByText(/CI runs use OpenRouter/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("starts with all three triggers on and GitHub review selected; no trigger blocks Continue with a hint", async () => {
    routeFetch({ "GET /repos": repos });
    renderWizard();
    await screen.findByLabelText("Target repository");
    click("Continue");

    for (const name of ["pull_request:opened", "pull_request:synchronize", "pull_request:reopened"]) {
      expect(screen.getByRole("checkbox", { name })).toBeChecked();
    }
    expect(screen.getByRole("radio", { name: /GitHub review/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /PR comment/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /None \(exit code only\)/ })).not.toBeChecked();

    for (const name of ["pull_request:opened", "pull_request:synchronize", "pull_request:reopened"]) {
      fireEvent.click(screen.getByRole("checkbox", { name }));
    }
    expect(screen.getByText("Select at least one trigger.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});

describe("Preview (AC-11–AC-15, AC-127, AC-146, AC-149, EC-17)", () => {
  it("requests a side-effect-free bundle, lists every file, edits only the workflow", async () => {
    routeFetch({ "GET /repos": repos, [EXPORT]: () => json(exportResponse()) });
    renderWizard();
    await toPreview();

    expect(bodyOf(callsTo(EXPORT)[0]!)).toEqual({
      repo: "acme/payments-api",
      target: "gha",
      action: "files",
      post_as: "github_review",
      triggers: ["opened", "synchronize", "reopened"],
    });
    const list = screen.getByRole("list", { name: "FILES TO CREATE" });
    expect(within(list).getAllByRole("button").map((b) => b.getAttribute("title"))).toEqual(BUNDLE_FILES.map((f) => f.path));

    expect(screen.getByLabelText(`Edit workflow: ${WORKFLOW}`)).toHaveValue(BUNDLE_FILES[5]!.contents);
    fireEvent.click(within(list).getByTitle(".devdigest/runner/300.index.js"));
    expect(within(list).getByTitle(".devdigest/runner/package.json")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByLabelText("File contents (read-only): .devdigest/runner/300.index.js")).toHaveTextContent("// chunk");
  });

  it("shows a loading state with Continue disabled while the bundle is in flight", async () => {
    let release!: (r: Response) => void;
    routeFetch({ "GET /repos": repos, [EXPORT]: () => new Promise<Response>((r) => (release = r)) });
    renderWizard();
    await screen.findByLabelText("Target repository");
    click("Continue");
    click("Continue");

    expect(screen.getByLabelText("Generating…")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await waitFor(() => expect(callsTo(EXPORT)).toHaveLength(1));
    release(new Response(JSON.stringify(exportResponse()), { status: 200 }));
    await screen.findByLabelText(`Edit workflow: ${WORKFLOW}`);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("shows the runner-bundle message with Retry, and Continue stays disabled until it works", async () => {
    let attempt = 0;
    routeFetch({
      "GET /repos": repos,
      [EXPORT]: () => (++attempt === 1 ? apiError(503, "runner_bundle_unavailable", "raw server text") : json(exportResponse())),
    });
    renderWizard();
    await screen.findByLabelText("Target repository");
    click("Continue");
    click("Continue");

    expect(await screen.findByText(/CI runner files are not built on the server/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByLabelText(`Edit workflow: ${WORKFLOW}`);
    expect(attempt).toBe(2);
  });

  it("shows another bundle error's message as given", async () => {
    routeFetch({ "GET /repos": repos, [EXPORT]: () => apiError(422, "bad", "Agent has no skills dir") });
    renderWizard();
    await screen.findByLabelText("Target repository");
    click("Continue");
    click("Continue");
    expect(await screen.findByText("Agent has no skills dir")).toBeInTheDocument();
  });

  it("keeps the edit across Back and Continue, and asks before regenerating after a config change", async () => {
    routeFetch({ "GET /repos": repos, [EXPORT]: () => json(exportResponse()) });
    renderWizard();
    await toPreview();
    fireEvent.change(screen.getByLabelText(`Edit workflow: ${WORKFLOW}`), { target: { value: "name: mine\n" } });

    click("Back");
    click("Continue");
    expect(screen.getByLabelText(`Edit workflow: ${WORKFLOW}`)).toHaveValue("name: mine\n");
    expect(callsTo(EXPORT)).toHaveLength(1);

    click("Back");
    fireEvent.click(screen.getByRole("radio", { name: /PR comment/ }));
    click("Continue");
    expect(screen.getByRole("alertdialog", { name: "Replace edited workflow?" })).toBeInTheDocument();
    expect(callsTo(EXPORT)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("radio", { name: /PR comment/ })).toBeChecked();
    expect(callsTo(EXPORT)).toHaveLength(1);

    click("Continue");
    fireEvent.click(screen.getByRole("button", { name: "Replace with regenerated" }));
    await waitFor(() => expect(callsTo(EXPORT)).toHaveLength(2));
    expect(bodyOf(callsTo(EXPORT)[1]!).post_as).toBe("pr_comment");
    expect(await screen.findByLabelText(`Edit workflow: ${WORKFLOW}`)).toHaveValue(BUNDLE_FILES[5]!.contents);
  });

  it("hints and blocks Continue when the workflow edit is over 64 KB", async () => {
    routeFetch({ "GET /repos": repos, [EXPORT]: () => json(exportResponse()) });
    renderWizard();
    await toPreview();

    fireEvent.change(screen.getByLabelText(`Edit workflow: ${WORKFLOW}`), { target: { value: "x".repeat(64 * 1024 + 1) } });
    expect(screen.getByText(/larger than 64 KB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(`Edit workflow: ${WORKFLOW}`), { target: { value: "x".repeat(64 * 1024) } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});

describe("Close (AC-16)", () => {
  it("closes from Cancel and Escape without any request that writes", async () => {
    routeFetch({ "GET /repos": repos, [EXPORT]: () => json(exportResponse()) });
    const onClose = renderWizard();
    await toPreview();
    fireEvent.change(screen.getByLabelText(`Edit workflow: ${WORKFLOW}`), { target: { value: "name: mine\n" } });

    click("Cancel");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(callsTo(EXPORT).map((c) => bodyOf(c).action)).toEqual(["files"]);
  });
});

async function toInstall() {
  await toPreview();
  click("Continue");
}

describe("Install (AC-17, AC-18, AC-20–AC-22, AC-126, AC-128)", () => {
  it("names repo, branch and file count, lists permissions, and opens the PR with the edited workflow", async () => {
    let release!: (r: Response) => void;
    routeFetch({
      "GET /repos": repos,
      [EXPORT]: (init) =>
        JSON.parse(String(init!.body)).action === "files"
          ? json(exportResponse())
          : new Promise<Response>((r) => (release = r)),
    });
    renderWizard();
    await toPreview();
    fireEvent.change(screen.getByLabelText(`Edit workflow: ${WORKFLOW}`), { target: { value: "name: mine\n" } });
    click("Continue");

    expect(screen.getByRole("radio", { name: /Open a PR with these files/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Copy files as a zip/ })).not.toBeChecked();
    expect(screen.getByText(/acme\/payments-api from the branch devdigest\/ci .* with the 6 generated files/)).toBeInTheDocument();
    expect(screen.getByText(/Classic token: repo and workflow/)).toBeInTheDocument();
    expect(screen.getByText(/Contents: write, Workflows: write, Pull requests: write, Actions: read/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    const installing = await screen.findByRole("button", { name: "Installing…" });
    expect(installing).toBeDisabled();
    expect(bodyOf(callsTo(EXPORT)[1]!)).toEqual({
      repo: "acme/payments-api",
      target: "gha",
      action: "open_pr",
      post_as: "github_review",
      triggers: ["opened", "synchronize", "reopened"],
      workflow_contents: "name: mine\n",
    });

    release(new Response(JSON.stringify(exportResponse({ pr_url: "https://github.com/acme/payments-api/pull/9", pr_number: 9 })), { status: 200 }));
    expect(await screen.findByText("Pull request ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View pull request" })).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/9");
    const steps = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(steps).toEqual([
      "Add OPENROUTER_API_KEY to the repository’s Actions secrets.",
      "Merge the pull request.",
      "Optionally make the check required to block merges.",
      "Use Refresh on the CI Runs page.",
    ]);
  });

  it("stays on Install with the server message and a Settings link when the token is missing, keeping the choices", async () => {
    routeFetch({
      "GET /repos": repos,
      [EXPORT]: (init) =>
        JSON.parse(String(init!.body)).action === "files"
          ? json(exportResponse())
          : apiError(400, "github_token_missing", "No GitHub token is configured"),
    });
    renderWizard();
    await toInstall();

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(await screen.findByText(/No GitHub token is configured/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/api-keys");
    expect(screen.getByRole("button", { name: "Install" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Open a PR with these files/ })).toBeChecked();
  });

  it("shows no Settings link for other errors", async () => {
    routeFetch({
      "GET /repos": repos,
      [EXPORT]: (init) =>
        JSON.parse(String(init!.body)).action === "files"
          ? json(exportResponse())
          : apiError(409, "branch_exists_without_pr", "Branch devdigest/ci exists without a PR"),
    });
    renderWizard();
    await toInstall();

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(await screen.findByText("Branch devdigest/ci exists without a PR")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Settings" })).toBeNull();
  });

  it("downloads a zip of exactly the Preview files, edited workflow included, and installs nothing", async () => {
    routeFetch({ "GET /repos": repos, [EXPORT]: () => json(exportResponse()) });
    renderWizard();
    await toPreview();
    fireEvent.change(screen.getByLabelText(`Edit workflow: ${WORKFLOW}`), { target: { value: "name: mine\n" } });
    click("Continue");

    fireEvent.click(screen.getByRole("radio", { name: /Copy files as a zip/ }));
    expect(screen.queryByText(/Token permissions needed/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));

    expect(await screen.findByText("Zip downloaded")).toBeInTheDocument();
    expect(downloadZip).toHaveBeenCalledTimes(1);
    const entries = unzipSync(downloadZip.mock.calls[0]![0] as Uint8Array);
    expect(Object.keys(entries).sort()).toEqual(BUNDLE_FILES.map((f) => f.path).sort());
    for (const f of BUNDLE_FILES) {
      expect(strFromU8(entries[f.path]!)).toBe(f.path === WORKFLOW ? "name: mine\n" : f.contents);
    }
    expect(callsTo(EXPORT).map((c) => bodyOf(c).action)).toEqual(["files"]);
  });
});
