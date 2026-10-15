import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { UpdatedStatus } from "./UpdatedStatus";
import { renderWithMessages } from "../renderWithMessages";

afterEach(cleanup);

const AS_OF = "2026-10-15T14:05:30.000Z";

describe("UpdatedStatus", () => {
  it("shows Updated HH:MM from as_of in a polite status region (AC-57, NFR-14)", () => {
    renderWithMessages(<UpdatedStatus asOf={AS_OF} refreshFailed={false} onRetry={vi.fn()} timeZone="UTC" />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("Updated 14:05");
  });

  it("shows the refresh-failed banner with Retry and leaves focus alone (AC-175, NFR-14)", () => {
    const onRetry = vi.fn();
    renderWithMessages(<UpdatedStatus asOf={AS_OF} refreshFailed onRetry={onRetry} timeZone="UTC" />);
    const before = document.activeElement;
    expect(screen.getByText("Couldn't refresh — showing data as of 14:05")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(before);
  });

  it("keeps an empty region before the first response", () => {
    renderWithMessages(<UpdatedStatus asOf={null} refreshFailed={false} onRetry={vi.fn()} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
