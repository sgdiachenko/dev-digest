import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { CostLabel } from "./CostLabel";
import { renderWithMessages } from "../renderWithMessages";
import messages from "../../../../messages/en/agentPerformance.json";

afterEach(cleanup);

describe("CostLabel", () => {
  it("shows the marker and opens the info tooltip on hover and on focus (AC-189)", () => {
    renderWithMessages(<CostLabel />);
    expect(screen.getByText("Recorded by DevDigest — not provider billing")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: messages.cost.infoButton });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent(messages.cost.info);
    expect(button).toHaveAccessibleDescription(messages.cost.info);
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
