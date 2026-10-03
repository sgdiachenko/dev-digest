import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

let current: RunTrace = TRACE;
vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: current, isLoading: false }),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1" }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  current = TRACE;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("renders the COST stat tile alongside duration/tokens/findings", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("renders Specs read: none for a trace without project_context (old trace)", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    const row = screen.getByText("Specs read").parentElement as HTMLElement;
    expect(row).toHaveTextContent("none");
    expect(screen.queryByRole("link", { name: /docs/ })).not.toBeInTheDocument();
  });

  it("links each spec to the catalog with its scanned sha, and labels estimates vs actual tokens", () => {
    current = {
      ...TRACE,
      specs_read: ["docs/a b.md", "docs/c.md"],
      prompt_assembly: { ...TRACE.prompt_assembly, specs: "## Project context\n### docs/a b.md\n<untrusted source=\"spec:docs/a b.md\">\nx\n</untrusted>" },
      project_context: {
        sha: "abcdef1234567890",
        budget_tokens: 12000,
        total_est_tokens: 1234,
        docs: [
          { path: "docs/a b.md", source: "agent", skill_name: null, est_tokens: 1000, status: "injected", reason: null },
          { path: "docs/c.md", source: "skill", skill_name: "s", est_tokens: 234, status: "injected", reason: null },
        ],
      },
    };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    const link = screen.getByRole("link", { name: "docs/a b.md" });
    expect(link).toHaveAttribute("href", "/repos/repo1/context?doc=docs%2Fa%20b.md");
    expect(screen.getAllByText("at abcdef1")).toHaveLength(2);
    fireEvent.click(screen.getByText("Prompt assembly"));
    // AC-32: the block is labelled as untrusted project context
    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    // specs block uses the server's total, not chars/4
    const est = screen.getByText("≈ 1,234 tokens · estimate");
    expect(est).toHaveAttribute("title", expect.stringContaining("Tokenizer estimate"));
    // TOKENS stat is marked as the actual count
    expect(screen.getByText("TOKENS · actual")).toBeInTheDocument();
  });
});
