import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ScoreRing } from "./ScoreRing";

afterEach(cleanup);

describe("ScoreRing", () => {
  it("shows the score and fills the ring proportionally in the accent colour", () => {
    render(<ScoreRing score={25} color="var(--crit)" label="Score 25" />);
    expect(screen.getByText("25")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Score 25" })).toBeTruthy();
    const arc = screen.getByTestId("score-ring-arc");
    const total = Number(arc.getAttribute("stroke-dasharray"));
    expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(total * 0.75, 5);
    expect(arc.getAttribute("stroke")).toBe("var(--crit)");
  });

  it("renders an empty ring and a dash when there is no score", () => {
    render(<ScoreRing score={null} color="var(--ok)" label="No score" />);
    expect(screen.getByText("–")).toBeTruthy();
    const arc = screen.getByTestId("score-ring-arc");
    expect(arc.getAttribute("stroke-dashoffset")).toBe(arc.getAttribute("stroke-dasharray"));
  });
});
