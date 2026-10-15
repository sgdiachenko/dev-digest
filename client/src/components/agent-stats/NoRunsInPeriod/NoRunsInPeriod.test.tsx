import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { NoRunsInPeriod } from "./NoRunsInPeriod";
import { renderWithMessages } from "../renderWithMessages";

afterEach(cleanup);

const LAST = "2026-09-02T10:00:00.000Z";
const lastText = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(LAST));

describe("NoRunsInPeriod", () => {
  it("shows the last run date and a way back to 30 days (AC-179)", () => {
    const onShow = vi.fn();
    renderWithMessages(<NoRunsInPeriod lastRunAt={LAST} option="1d" onShowLast30={onShow} timeZone="UTC" />);
    expect(screen.getByText(`No runs in this period · last run ${lastText}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show last 30 days" }));
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("hides the button when 30 days is already selected (AC-181)", () => {
    renderWithMessages(<NoRunsInPeriod lastRunAt={LAST} option="30d" onShowLast30={vi.fn()} timeZone="UTC" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
