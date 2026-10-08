import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord, ReviewRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

// BlastRadiusCard has its own data hooks and tests; here it only has to be present.
vi.mock("../BlastRadiusCard", () => ({
  BlastRadiusCard: () => <div data-testid="blast-card">blast</div>,
}));

import { OverviewTab } from "./OverviewTab";

const BRIEF: PrBriefRecord = {
  pr_id: "pr1",
  head_sha: "0123456789abcdef",
  stale: false,
  generated_at: new Date().toISOString(),
  provider: "openai",
  model: "gpt-4.1",
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.01,
  input_tokens_est: 90,
  missing_inputs: [{ input: "intent", reason: "not_derived" }],
  specs_sha: null,
  specs_used: [],
  summary: "Adds a rate limiter. <img src=x onerror=alert(1)> **bold**",
  review_focus: [{ file: "src/a.ts", line: 12, reason: "New limiter", line_verified: true }],
  intent: null,
  blast: null,
  risks: {
    risks: [{ kind: "security", title: "Bypass risk", explanation: "why", severity: "high", file_refs: ["src/a.ts:12"] }],
  },
  history: null,
};

interface Route {
  status: number;
  body: unknown;
}
let routes: { get: Route; post: Route };
let posts: number;
let postGate: Promise<void> | null;

function res(r: Route) {
  return { ok: r.status < 400, status: r.status, statusText: "", json: async () => r.body };
}

beforeEach(() => {
  posts = 0;
  postGate = null;
  routes = { get: { status: 200, body: null }, post: { status: 200, body: BRIEF } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/pulls/pr1/brief")) {
        if (init?.method === "POST") {
          posts += 1;
          if (postGate) await postGate;
          return res(routes.post);
        }
        return res(routes.get);
      }
      if (url.endsWith("/settings")) return res({ status: 200, body: {} });
      return res({ status: 200, body: null }); // intent: not derived
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTab(props: Partial<React.ComponentProps<typeof OverviewTab>> = {}) {
  const onOpenFile = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        messages={{ brief: briefMessages, prReview: prReviewMessages, shell: shellMessages }}
      >
        <OverviewTab
          prId="pr1"
          repoId="r1"
          prBody="PR description"
          changedFiles={["src/a.ts"]}
          latestReview={null}
          onOpenFile={onOpenFile}
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onOpenFile;
}

const review = (o: Partial<ReviewRecord> = {}): ReviewRecord =>
  ({
    id: "rev1", pr_id: "pr1", kind: "review", verdict: "request_changes", summary: "Needs work", score: 42,
    agent_name: "Sec", created_at: "2026-10-01T00:00:00Z", findings: [], ...o,
  }) as ReviewRecord;

describe("OverviewTab — PR Brief", () => {
  it("(a) empty -> Generate sends exactly one POST, shows a disabled 'Generating…' + skeleton, then the brief without reload", async () => {
    let release!: () => void;
    postGate = new Promise<void>((r) => (release = r));
    renderTab();
    const gen = await screen.findByRole("button", { name: "Generate brief" });
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    fireEvent.click(gen);
    const pendingBtn = await screen.findByRole("button", { name: "Generating…" });
    expect(pendingBtn).toBeDisabled();
    expect(screen.getAllByTestId("brief-skeleton").length).toBeGreaterThan(0);
    release();
    expect(await screen.findByText(/Adds a rate limiter/)).toBeInTheDocument();
    expect(posts).toBe(1);
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(screen.queryByTestId("brief-skeleton")).toBeNull();
  });

  it("(b) a stored brief is shown without any POST, summary labelled AI-generated and above the blocks", async () => {
    routes.get = { status: 200, body: BRIEF };
    renderTab();
    const summary = await screen.findByText(/Adds a rate limiter/);
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
    expect(posts).toBe(0);
    const blast = screen.getByTestId("blast-card");
    expect(summary.compareDocumentPosition(blast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Review focus — read these first")).toBeInTheDocument();
  });

  it("(c) a failed regenerate keeps the previous brief and shows the reason with Retry", async () => {
    routes.get = { status: 200, body: BRIEF };
    routes.post = { status: 502, body: { error: { code: "bad_gateway", message: "x", details: { reason: "llm_timeout" } } } };
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("The model took too long to respond. Try again.")).toBeInTheDocument();
    expect(screen.getByText(/Adds a rate limiter/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("(d) missing_key shows the provider and links to the Settings pages", async () => {
    routes.post = { status: 409, body: { error: { code: "conflict", message: "x", details: { reason: "missing_key", provider: "openai" } } } };
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));
    expect(await screen.findByText("Add an API key for openai in Settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings → API Keys" })).toHaveAttribute("href", "/settings/api-keys");
    expect(screen.getByRole("link", { name: "Settings → Feature Models" })).toHaveAttribute("href", "/settings/models");
  });

  it("(e) 429 shows the rate-limit message and leaves the button enabled", async () => {
    routes.post = { status: 429, body: { error: { code: "too_many_requests", message: "slow down" } } };
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));
    expect(await screen.findByText("Too many brief requests — try again in a minute")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeEnabled();
  });

  it("(f) a GET error shows 'Couldn't load the brief' + Retry while Intent and Blast stay visible", async () => {
    routes.get = { status: 500, body: { error: { code: "x", message: "boom" } } };
    renderTab();
    expect(await screen.findByText("Couldn't load the brief")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(await screen.findByText("Not derived yet")).toBeInTheDocument();
    expect(screen.getByTestId("blast-card")).toBeInTheDocument();
  });

  it("(g) the verdict banner shows the review's verdict and score when a review exists, and is absent otherwise", async () => {
    routes.get = { status: 200, body: BRIEF };
    renderTab({ latestReview: review() });
    expect(await screen.findByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    cleanup();
    renderTab({ latestReview: null });
    await screen.findByText(/Adds a rate limiter/);
    expect(screen.queryByText("Request changes")).toBeNull();
    expect(screen.queryByText("PR SCORE")).toBeNull();
  });

  it("(h) activating a Review-focus item calls onOpenFile with file and line", async () => {
    routes.get = { status: 200, body: BRIEF };
    const onOpenFile = renderTab();
    const focusBtn = await screen.findAllByRole("button", { name: "src/a.ts:12" });
    fireEvent.click(focusBtn[focusBtn.length - 1]!);
    expect(onOpenFile).toHaveBeenCalledWith("src/a.ts", 12);
  });

  it("(i) model HTML / markdown is rendered literally", async () => {
    routes.get = { status: 200, body: BRIEF };
    renderTab();
    expect(await screen.findByText("Adds a rate limiter. <img src=x onerror=alert(1)> **bold**")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("(j) Risk areas render inside section#intent, in the Intent block", async () => {
    routes.get = { status: 200, body: BRIEF };
    renderTab();
    await screen.findByText("Bypass risk");
    const intent = document.getElementById("intent")!;
    expect(within(intent).getByText("Risk areas")).toBeInTheDocument();
    expect(within(intent).getByText("Bypass risk")).toBeInTheDocument();
    expect(within(intent).getByText("Intent")).toBeInTheDocument();
  });

  it("(k) 'Generated without: intent' links to #intent and that anchor exists in the document", async () => {
    routes.get = { status: 200, body: BRIEF };
    renderTab();
    const link = await screen.findByRole("link", { name: "Derive intent" });
    expect(link).toHaveAttribute("href", "#intent");
    await waitFor(() => expect(document.getElementById("intent")).not.toBeNull());
  });

  it("(l) while the brief GET is loading the skeleton shows and there is no Generate button", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/pulls/pr1/brief")) await gate;
        return res(url.endsWith("/pulls/pr1/brief") ? routes.get : { status: 200, body: url.endsWith("/settings") ? {} : null });
      }),
    );
    renderTab();
    expect(await screen.findAllByTestId("brief-skeleton")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Generate brief" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Regenerate" })).toBeNull();
    release();
    expect(await screen.findByRole("button", { name: "Generate brief" })).toBeInTheDocument();
  });

  it("(m) the provenance age comes from the message catalog (singular/plural)", async () => {
    routes.get = { status: 200, body: { ...BRIEF, generated_at: new Date(Date.now() - 2 * 3_600_000).toISOString() } };
    renderTab();
    expect(await screen.findByText(/Generated 2 hours ago for commit/)).toBeInTheDocument();
  });
});
