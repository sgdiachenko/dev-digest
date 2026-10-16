import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { StatsErrorPanel } from "./StatsErrorPanel";
import { renderWithMessages } from "../renderWithMessages";

afterEach(cleanup);

describe("StatsErrorPanel", () => {
  it("shows the title and reason, and Retry calls the handler (AC-173)", () => {
    const onRetry = vi.fn();
    renderWithMessages(<StatsErrorPanel title="Couldn't load this agent's stats" reason="500 Internal Server Error" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load this agent's stats");
    expect(screen.getByText("500 Internal Server Error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
