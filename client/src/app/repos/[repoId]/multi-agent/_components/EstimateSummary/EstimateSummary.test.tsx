import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import multiAgent from "../../../../../../../messages/en/multiAgent.json";
import { EstimateSummary } from "./EstimateSummary";

afterEach(cleanup);

function renderSummary(totals: React.ComponentProps<typeof EstimateSummary>["totals"]) {
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent }}>
      <EstimateSummary totals={totals} />
    </NextIntlClientProvider>,
  );
}

describe("EstimateSummary", () => {
  it("shows the slowest duration and summed cost", () => {
    renderSummary({ durationMs: 12000, costUsd: 0.03, withoutData: 0 });
    expect(screen.getByText(/≈ 12s · \$0\.03/)).toBeInTheDocument();
  });

  it("shows 'no data' when no checked agent has an estimate", () => {
    renderSummary({ durationMs: null, costUsd: null, withoutData: 2 });
    expect(screen.getByText(/no data/)).toBeInTheDocument();
  });
});
