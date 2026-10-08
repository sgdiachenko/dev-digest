import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import { BriefMissingInputs } from "./BriefMissingInputs";

afterEach(cleanup);

function renderMissing(missing: Parameters<typeof BriefMissingInputs>[0]["missing"]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <BriefMissingInputs missing={missing} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("BriefMissingInputs", () => {
  it("lists each missing input with its reason; intent links to #intent, specs to Project Context", () => {
    renderMissing([
      { input: "intent", reason: "not_derived" },
      { input: "specs", reason: "no_catalog" },
      { input: "blast", reason: "over_budget" },
    ]);
    expect(screen.getByText("Generated without:")).toBeInTheDocument();
    expect(screen.getByText("Intent — not derived yet")).toBeInTheDocument();
    expect(screen.getByText("Blast radius — trimmed to fit the budget")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Derive intent" })).toHaveAttribute("href", "#intent");
    expect(screen.getByRole("link", { name: "Open Project Context" })).toHaveAttribute("href", "/repos/r1/context");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("renders nothing when nothing is missing", () => {
    const { container } = renderMissing([]);
    expect(container).toBeEmptyDOMElement();
  });
});
