import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import { BriefHeader, type BriefStatus } from "./BriefHeader";
import type { BriefError } from "@/lib/hooks/brief";

afterEach(cleanup);

const BRIEF = {
  pr_id: "pr1",
  head_sha: "0123456789abcdef",
  stale: false,
  generated_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  provider: "openai",
  model: "gpt-4.1",
  cost_usd: null,
} as unknown as PrBriefRecord;

function renderHeader(o: {
  brief?: PrBriefRecord | null;
  status?: BriefStatus;
  error?: BriefError | null;
  onGenerate?: () => void;
}) {
  const onGenerate = o.onGenerate ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <BriefHeader
        brief={o.brief ?? null}
        modelLabel="gpt-4.1"
        status={o.status ?? "idle"}
        error={o.error ?? null}
        onGenerate={onGenerate}
      />
    </NextIntlClientProvider>,
  );
  return onGenerate;
}

describe("BriefHeader", () => {
  it("empty state: explanation, model hint and a Generate button that fires once", () => {
    const onGenerate = renderHeader({});
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByText("Model: gpt-4.1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("with a brief: Regenerate, provenance with 'cost not reported' for a null cost, Outdated only when stale", () => {
    renderHeader({ brief: BRIEF });
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(screen.getByText(/for commit 0123456 · gpt-4\.1 · cost not reported/)).toBeInTheDocument();
    expect(screen.queryByText(/Outdated/)).toBeNull();
    cleanup();
    renderHeader({ brief: { ...BRIEF, stale: true } });
    expect(screen.getByText("Outdated — the PR has new commits since this brief")).toBeInTheDocument();
  });

  it("pending: disabled 'Generating…' and a polite status announcement", () => {
    renderHeader({ brief: BRIEF, status: "pending" });
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Generating brief…");
  });

  it("reason errors name the reason and offer Retry", () => {
    const onGenerate = renderHeader({ brief: BRIEF, status: "error", error: { kind: "llm_timeout" } });
    expect(screen.getByText("The model took too long to respond. Try again.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["llm_error", "The model request failed. Try again."],
    ["invalid_output", "The model returned an unusable answer. Try again."],
    ["no_diff_data", "This PR has no diff data yet."],
  ] as const)("shows %s with an operable Retry", (kind, message) => {
    const onGenerate = renderHeader({ brief: BRIEF, status: "error", error: { kind } });
    expect(screen.getByText(message)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("missing_key names the provider and links to API Keys and Feature Models", () => {
    renderHeader({ status: "error", error: { kind: "missing_key", provider: "openai" } });
    expect(screen.getByText("Add an API key for openai in Settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings → API Keys" })).toHaveAttribute("href", "/settings/api-keys");
    expect(screen.getByRole("link", { name: "Settings → Feature Models" })).toHaveAttribute("href", "/settings/models");
  });

  it("rate limited: message shown and the generate button stays enabled", () => {
    renderHeader({ brief: BRIEF, status: "error", error: { kind: "rate_limited" } });
    expect(screen.getByText("Too many brief requests — try again in a minute")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
  });

  it("unknown failures and input_over_budget show a generic message with Retry", () => {
    renderHeader({ status: "error", error: { kind: "other" } });
    expect(screen.getByText("Couldn't generate the brief.")).toBeInTheDocument();
    cleanup();
    renderHeader({ status: "error", error: { kind: "input_over_budget" } });
    expect(screen.getByText("The PR input is too large to brief.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
