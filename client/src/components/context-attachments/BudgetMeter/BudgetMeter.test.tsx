import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/context.json";
import { BudgetMeter } from "./BudgetMeter";

afterEach(cleanup);

function renderMeter(props: React.ComponentProps<typeof BudgetMeter>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <BudgetMeter {...props} />
    </NextIntlClientProvider>,
  );
}

describe("BudgetMeter", () => {
  it("shows the total against the budget with no warning while within budget", () => {
    renderMeter({ total: 1234, budget: 8000, overBudget: false, skippedPaths: [] });
    expect(screen.getByText("≈ 1,234 / 8,000 tokens")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns and names the documents that would be skipped when over budget", () => {
    renderMeter({ total: 9100, budget: 8000, overBudget: true, skippedPaths: ["docs/b.md", "docs/c.md"] });
    expect(screen.getByText("≈ 9,100 / 8,000 tokens")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("docs/b.md, docs/c.md");
  });

  it("falls back to a generic warning when no document is named", () => {
    renderMeter({ total: 9100, budget: 8000, overBudget: true, skippedPaths: [] });
    expect(screen.getByRole("alert")).toHaveTextContent("some documents would be skipped");
  });
});
