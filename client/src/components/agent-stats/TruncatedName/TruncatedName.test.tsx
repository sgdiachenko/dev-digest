import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { TruncatedName } from "./TruncatedName";
import { renderWithMessages } from "../renderWithMessages";

afterEach(cleanup);

const LONG = "A very long agent name that will not fit in a narrow table column <b>x</b>";

describe("TruncatedName", () => {
  it("truncates on one line, keeps the full text as title and name, and shows a tooltip on focus (AC-127, EC-14)", () => {
    renderWithMessages(<TruncatedName name={LONG} />);
    const el = screen.getByLabelText(LONG);
    expect(el).toHaveAttribute("title", LONG);
    expect(el).toHaveAttribute("tabindex", "0");
    expect(el).toHaveStyle({ textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(el);
    expect(screen.getByRole("tooltip")).toHaveTextContent(LONG);
    expect(screen.queryByText("x", { selector: "b" })).not.toBeInTheDocument();
  });
});
