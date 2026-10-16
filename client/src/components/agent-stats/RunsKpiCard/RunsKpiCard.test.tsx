import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { RunsKpiCard } from "./RunsKpiCard";
import { renderWithMessages } from "../renderWithMessages";

afterEach(cleanup);

const trend = [0, 3, 1].map((runs, i) => ({ bucket_start: `2026-10-0${i + 1}T00:00:00.000Z`, runs }));

describe("RunsKpiCard", () => {
  it("shows runs, the failed/cancelled line and a described sparkline (AC-101, AC-102, AC-144, NFR-13)", () => {
    renderWithMessages(<RunsKpiCard label="Total runs (30 days)" runs={16} failed={1} cancelled={1} trend={trend} unit="day" />);
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(screen.getByText("1 failed · 1 cancelled")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Runs per day, 0 to 3" })).toBeInTheDocument();
  });

  it("shows the in-progress line only above zero (AC-103)", () => {
    renderWithMessages(
      <RunsKpiCard label="Runs" runs={2} failed={0} cancelled={0} inProgress={2} trend={trend} unit="day" />,
    );
    expect(screen.getByText("2 in progress (not counted)")).toBeInTheDocument();
    cleanup();
    renderWithMessages(<RunsKpiCard label="Runs" runs={2} failed={0} cancelled={0} inProgress={0} trend={trend} unit="day" />);
    expect(screen.queryByText(/in progress/)).not.toBeInTheDocument();
  });
});
