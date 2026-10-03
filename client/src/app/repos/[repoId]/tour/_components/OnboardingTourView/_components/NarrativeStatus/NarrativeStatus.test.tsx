import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingNarrative } from "@/lib/types";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { NarrativeStatus } from "./NarrativeStatus";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function narrativeOf(o: Partial<OnboardingNarrative> = {}): OnboardingNarrative {
  return {
    status: "ready",
    generation_id: "g1",
    source_sha: "abcdef0123456789",
    outdated: false,
    generated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    provider: "openrouter",
    model: "gpt-x",
    input_tokens: 1,
    output_tokens: 1,
    cost_usd: 0.0312,
    last_failure: null,
    fallback_sections: [],
    sections: { architecture: null, critical_paths: null, run_locally: null, reading_path: null, first_tasks: null },
    ...o,
  };
}

function renderStatus(narrative: OnboardingNarrative | null, onRetry = () => {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <NarrativeStatus narrative={narrative} onRetry={onRetry} />
    </NextIntlClientProvider>,
  );
}

const failure = (o: Partial<NonNullable<OnboardingNarrative["last_failure"]>>) =>
  narrativeOf({
    status: "failed",
    last_failure: { reason: "llm_error", at: "2026-10-01T10:00:00.000Z", provider: null, model: null, ...o },
  });

describe("NarrativeStatus", () => {
  it("renders nothing without a narrative", () => {
    const { container } = renderStatus(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows when, from which commit, by which model and at what cost", () => {
    renderStatus(narrativeOf());
    expect(screen.getByText("Generated 5m ago from commit abcdef0 · gpt-x · $0.03")).toBeInTheDocument();
  });

  it("says cost not reported when the cost is null", () => {
    renderStatus(narrativeOf({ cost_usd: null }));
    expect(screen.getByText(/gpt-x · cost not reported$/)).toBeInTheDocument();
  });

  it("shows the Outdated chip only when outdated", () => {
    renderStatus(narrativeOf({ outdated: true }));
    expect(screen.getByText("Outdated — repository changed since")).toBeInTheDocument();
    cleanup();
    renderStatus(narrativeOf());
    expect(screen.queryByText(/Outdated/)).toBeNull();
  });

  it("shows a generic failure with Retry", () => {
    const onRetry = vi.fn();
    renderStatus(failure({ reason: "llm_timeout" }), onRetry);
    expect(screen.getByText("Generation timed out")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("missing_key names the provider and links to API keys", () => {
    renderStatus(failure({ reason: "missing_key", provider: "openrouter" }));
    expect(screen.getByText("Add an API key for openrouter in Settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/api-keys");
  });

  it("no_structured_provider names the model and links to model settings", () => {
    renderStatus(failure({ reason: "no_structured_provider", model: "plain-model" }));
    expect(screen.getByText(/No provider for plain-model supports structured output/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/models");
  });

  it("shows no failure text while generating or ready", () => {
    renderStatus(narrativeOf({ status: "generating" }));
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
