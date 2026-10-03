import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/context.json";
import { TokenEstimate } from "./TokenEstimate";

afterEach(cleanup);

function renderEstimate(tokens: number | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <TokenEstimate tokens={tokens} />
    </NextIntlClientProvider>,
  );
}

describe("TokenEstimate", () => {
  it("shows the estimate and reveals the accuracy tooltip on hover and on focus", () => {
    renderEstimate(1234);
    const estimate = screen.getByText("≈1,234");
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(estimate);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/10–30 %/);
    fireEvent.mouseLeave(estimate);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(estimate);
    const tooltip = screen.getByRole("tooltip");
    expect(estimate).toHaveAttribute("aria-describedby", tooltip.id);
    fireEvent.blur(estimate);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("renders a dash for a document that was not read", () => {
    renderEstimate(null);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/≈/)).toBeNull();
  });
});
