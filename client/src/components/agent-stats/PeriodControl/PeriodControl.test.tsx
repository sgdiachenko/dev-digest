import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { PeriodControl } from "./PeriodControl";
import { renderWithMessages } from "../renderWithMessages";
import { resolvePreset } from "../../../lib/agent-stats/period";

afterEach(cleanup);

const NOW = Date.parse("2026-10-15T12:00:00.000Z");

describe("PeriodControl", () => {
  it("offers three buttons with 30 days pressed and shows the resolved range (AC-44, AC-55, NFR-11)", () => {
    renderWithMessages(<PeriodControl period={resolvePreset("30d", NOW)} onSelect={vi.fn()} timeZone="UTC" />);
    expect(screen.getByRole("button", { name: "1 day" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Custom range" })).toHaveAttribute("aria-pressed", "false");
    const fmt = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
    expect(
      screen.getByText(`${fmt.format(new Date(NOW - 30 * 86_400_000))} – ${fmt.format(new Date(NOW))}`),
    ).toBeInTheDocument();
  });

  it("selects a preset through onSelect", () => {
    const onSelect = vi.fn();
    renderWithMessages(<PeriodControl period={resolvePreset("30d", NOW)} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ option: "1d" });
  });

  it("reveals inline date fields, disables Apply with a linked reason, and applies a valid range (AC-48, AC-49, NFR-16)", () => {
    const onSelect = vi.fn();
    renderWithMessages(<PeriodControl period={resolvePreset("30d", NOW)} onSelect={onSelect} />);
    expect(screen.queryByLabelText("Start date")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();
    expect(apply).toHaveAccessibleDescription("Choose a start and an end date");

    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-10-03" } });
    expect(apply).toBeDisabled();
    expect(apply).toHaveAccessibleDescription("The start date is after the end date");

    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-10-06" } });
    expect(apply).toBeEnabled();
    expect(apply).not.toHaveAccessibleDescription();
    fireEvent.click(apply);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ option: "custom" });
  });

  it("shows the link notice and the server-invalid text (AC-53, AC-176)", () => {
    renderWithMessages(<PeriodControl period={resolvePreset("30d", NOW)} notice serverInvalid onSelect={vi.fn()} />);
    expect(screen.getByText("The link's period was invalid — showing the last 30 days")).toBeInTheDocument();
    expect(screen.getByText("This period is invalid — choose another period")).toBeInTheDocument();
  });
});
