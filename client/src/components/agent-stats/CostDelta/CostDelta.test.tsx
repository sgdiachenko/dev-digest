import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { CostDelta } from "./CostDelta";
import { renderWithMessages } from "../renderWithMessages";

afterEach(cleanup);

describe("CostDelta", () => {
  it("is green with a down arrow when the cost fell, in the avg format (AC-138, AC-142)", () => {
    renderWithMessages(<CostDelta current={2.8} previous={4} option="30d" />);
    expect(screen.getByText("↓ $1.20 vs previous 30 days")).toHaveStyle({ color: "var(--ok)" });
  });

  it("is red with an up arrow when the cost rose", () => {
    renderWithMessages(<CostDelta current={0.0381818} previous={0.03} option="1d" />);
    expect(screen.getByText("↑ $0.0082 vs previous 1 day")).toHaveStyle({ color: "var(--crit)" });
  });

  it("renders nothing when either side is null (AC-139)", () => {
    const { container } = renderWithMessages(<CostDelta current={null} previous={1} option="30d" />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    const second = renderWithMessages(<CostDelta current={1} previous={null} option="30d" />);
    expect(second.container).toBeEmptyDOMElement();
  });
});
