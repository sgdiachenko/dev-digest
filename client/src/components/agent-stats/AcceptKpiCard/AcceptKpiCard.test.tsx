import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { AcceptKpiCard } from "./AcceptKpiCard";
import { renderWithMessages } from "../renderWithMessages";

afterEach(cleanup);

const base = { label: "Accept rate", accepted: 16, dismissed: 6, pending: 4 };

describe("AcceptKpiCard", () => {
  it("shows the percent and the decided line, coloured by the scale (AC-106, NFR-12)", () => {
    renderWithMessages(<AcceptKpiCard {...base} rate={16 / 22} smallSample={false} />);
    expect(screen.getByText("73%")).toHaveStyle({ color: "var(--warn)" });
    expect(screen.getByText("16 of 22 decided · 4 pending")).toBeInTheDocument();
    expect(screen.queryByText("small sample")).not.toBeInTheDocument();
  });

  it("mutes a small sample and says so in text (AC-107, AC-147)", () => {
    renderWithMessages(<AcceptKpiCard {...base} accepted={3} dismissed={2} pending={0} rate={0.6} smallSample />);
    expect(screen.getByText("60%")).toHaveStyle({ color: "var(--text-muted)" });
    expect(screen.getByText("small sample")).toBeInTheDocument();
  });

  it("shows a dash and 0 decided without decisions", () => {
    renderWithMessages(<AcceptKpiCard {...base} accepted={0} dismissed={0} pending={2} rate={null} smallSample />);
    expect(screen.getByText("0 decided")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
