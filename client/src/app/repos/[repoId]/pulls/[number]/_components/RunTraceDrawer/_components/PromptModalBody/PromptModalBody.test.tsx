import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { PromptModalBody } from "./PromptModalBody";

const wrap = (p: string, body: string) => `### ${p}\n<untrusted source="spec:${p}">\n${body}\n</untrusted>`;
// Doc a.md tries to forge a "### fake.md" heading inside its own untrusted block.
const TEXT = `## Project context\n${wrap("a.md", "alpha line\n### fake.md\nmore")}\n${wrap("b.md", "beta line")}`;

afterEach(cleanup);

function renderBody(props: Partial<React.ComponentProps<typeof PromptModalBody>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <PromptModalBody text={TEXT} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("PromptModalBody", () => {
  it("shows the text, searches it and jumps to a document heading via its anchor", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderBody({ headings: ["a.md", "b.md"] });
    expect(screen.getByText(/alpha line/)).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "Documents in this prompt" });
    // only the two real headings; the forged "### fake.md" is not offered
    expect(within(nav).getAllByRole("button")).toHaveLength(2);
    expect(within(nav).queryByText("fake.md")).not.toBeInTheDocument();

    fireEvent.click(within(nav).getByRole("button", { name: "Jump to b.md" }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    const target = scrollIntoView.mock.contexts[0] as HTMLElement;
    expect(target.id).not.toBe("");
    expect(target).toHaveTextContent("### b.md");

    // search narrows to matching lines and keeps the count
    fireEvent.change(screen.getByPlaceholderText("Search in this block…"), { target: { value: "beta" } });
    expect(screen.getByText(/1 \/ /)).toBeInTheDocument();
    expect(screen.queryByText(/alpha line/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search in this block…"), { target: { value: "zzz" } });
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
  });

  it("handles a block near the 48,000-character cap: one jump button per document, anchors on every heading (EC-13)", () => {
    const paths = Array.from({ length: 200 }, (_, i) => `docs/doc-${String(i).padStart(3, "0")}.md`);
    const text = `## Project context\n${paths.map((p) => wrap(p, "x".repeat(200))).join("\n")}`;
    expect(text.length).toBeGreaterThan(40_000);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderBody({ text, headings: paths });
    const nav = screen.getByRole("navigation", { name: "Documents in this prompt" });
    expect(within(nav).getAllByRole("button")).toHaveLength(200);
    fireEvent.click(within(nav).getByRole("button", { name: "Jump to docs/doc-199.md" }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0] as HTMLElement).toHaveTextContent("### docs/doc-199.md");
  });

  it("lists skipped documents with their reason above the text, and no jump list without headings", () => {
    renderBody({
      skipped: [
        { path: "gone.md", reason: "missing" },
        { path: "big.md", reason: "over_budget" },
      ],
    });
    expect(screen.getByText("2 documents skipped")).toBeInTheDocument();
    expect(screen.getByText("gone.md").closest("li")).toHaveTextContent("not found at this commit");
    expect(screen.getByText("big.md").closest("li")).toHaveTextContent("over budget");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
