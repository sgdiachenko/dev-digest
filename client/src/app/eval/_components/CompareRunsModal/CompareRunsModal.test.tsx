import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CompareRunsModal } from "./CompareRunsModal";
import { comparisonOf, renderEval } from "../testing";

afterEach(cleanup);

describe("CompareRunsModal (T44)", () => {
  it("orders old -> new by start time and shows four tiles with deltas in points and USD (AC-122, 123)", () => {
    const base = comparisonOf();
    // runs handed over newest-first: the title must still read v2 -> v3
    renderEval(<CompareRunsModal comparison={{ ...base, a: base.b, b: base.a }} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Compare runs · v2 → v3");
    expect(screen.getByText("Old prompt vs new — metric deltas and prompt diff")).toBeInTheDocument();

    for (const label of ["RECALL", "PRECISION", "CITATION ACCURACY", "Cost"]) {
      expect(within(dialog).getByText(label)).toBeInTheDocument();
    }
    expect(within(dialog).getByText("▲ 5 pts")).toBeInTheDocument(); // recall 70 -> 75
    expect(within(dialog).getByText("▼ 5 pts")).toBeInTheDocument(); // precision 90 -> 85
    expect(within(dialog).getByText("no change")).toBeInTheDocument();
    expect(within(dialog).getByText("$0.01")).toBeInTheDocument(); // old cost 0.012
    expect(within(dialog).getByText("$0.23")).toBeInTheDocument();
    expect(within(dialog).getByText("▲ $0.22")).toBeInTheDocument();
  });

  it("highlights inserted and removed words with a text legend (AC-124)", () => {
    renderEval(<CompareRunsModal comparison={comparisonOf()} onClose={vi.fn()} />);
    expect(screen.getByText("System prompt diff")).toBeInTheDocument();
    const diff = screen.getByTestId("prompt-diff");
    expect(diff.querySelector("del")).toHaveTextContent("5");
    expect(diff.querySelector("ins")).toHaveTextContent("3");
    expect(screen.getByText(/v2 \(old\)/)).toBeInTheDocument();
    expect(screen.getByText(/v3 \(new\)/)).toBeInTheDocument();
  });

  it("says so when the configuration is identical, and when the case sets differ (AC-125, 166)", () => {
    renderEval(
      <CompareRunsModal
        comparison={comparisonOf({ identical_config: true, case_set: { added: ["c1"], removed: ["c2", "c3"] } })}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Identical configuration — /)).toBeInTheDocument();
    expect(screen.queryByTestId("prompt-diff")).not.toBeInTheDocument();
    expect(screen.getByText("Case sets differ: +1 added, −2 removed")).toBeInTheDocument();
  });

  it("lists case flips", () => {
    renderEval(
      <CompareRunsModal
        comparison={comparisonOf({ flips: [{ case_id: "c1", case_name: "sql injection", a: "pass", b: "fail", flip: "pass_to_fail" }] })}
        onClose={vi.fn()}
      />,
    );
    const row = screen.getByRole("row", { name: /sql injection/ });
    expect(row).toHaveTextContent("pass → fail");
  });

  it("closes from the footer or Escape, and focus returns to the Compare trigger (AC-131, NFR-9)", () => {
    const onClose = vi.fn();
    const tree = (open: boolean) => (
      <>
        <button>Compare</button>
        {open && <CompareRunsModal comparison={comparisonOf()} onClose={onClose} />}
      </>
    );
    const { rerenderEval } = renderEval(tree(false));
    const trigger = screen.getByRole("button", { name: "Compare" });
    trigger.focus();
    rerenderEval(tree(true));
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    const footerClose = within(dialog).getAllByRole("button", { name: "Close" }).at(-1)!;
    fireEvent.click(footerClose);
    expect(onClose).toHaveBeenCalledTimes(2);

    rerenderEval(tree(false));
    expect(trigger).toHaveFocus();
  });
});
