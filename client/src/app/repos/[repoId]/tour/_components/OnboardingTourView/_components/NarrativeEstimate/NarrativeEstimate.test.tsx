import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { NarrativeEstimate } from "./NarrativeEstimate";

afterEach(cleanup);

function renderEstimate(estimatedCost: React.ComponentProps<typeof NarrativeEstimate>["estimatedCost"]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <NarrativeEstimate estimatedCost={estimatedCost} />
    </NextIntlClientProvider>,
  );
}

describe("NarrativeEstimate", () => {
  it("shows the model with an approximate or unknown cost", () => {
    renderEstimate({ model: "gpt-x", approx_usd: 0.05 });
    expect(screen.getByText("gpt-x · approx. $0.05")).toBeInTheDocument();
    cleanup();
    renderEstimate({ model: "gpt-x", approx_usd: null });
    expect(screen.getByText("gpt-x · cost unknown")).toBeInTheDocument();
  });

  it("renders nothing without an estimate", () => {
    const { container } = renderEstimate(null);
    expect(container).toBeEmptyDOMElement();
  });
});
