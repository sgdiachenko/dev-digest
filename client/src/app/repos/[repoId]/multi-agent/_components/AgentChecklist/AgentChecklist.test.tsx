import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import multiAgent from "../../../../../../../messages/en/multiAgent.json";
import common from "../../../../../../../messages/en/common.json";
import { AgentChecklist } from "./AgentChecklist";

afterEach(cleanup);

const agent = (id: string, name: string, enabled = true, description = "") =>
  ({ id, name, enabled, description }) as Agent;
const LONG = "Extremely long agent name ".repeat(12).trim();

function renderList(props: Partial<React.ComponentProps<typeof AgentChecklist>> = {}) {
  const onToggle = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent, common }}>
      <AgentChecklist
        agents={[agent("a1", "Security", true, "Finds vulnerabilities"), agent("a2", "Style", false), agent("a3", LONG)]}
        estimates={[{ agent_id: "a1", runs: 4, avg_duration_ms: 6000, avg_cost_usd: 0.012 }]}
        checked={["a1"]}
        loading={false}
        onToggle={onToggle}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onToggle };
}

describe("AgentChecklist", () => {
  it("shows a checkbox per agent, the estimate or 'no data', and disables disabled agents", () => {
    const { onToggle } = renderList();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(screen.getByText("≈ 6s · $0.012")).toBeInTheDocument();
    expect(screen.getAllByText("no data")).toHaveLength(2);
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(boxes[0]).toHaveAttribute("aria-checked", "true");
    expect(boxes[1]).toBeDisabled();

    fireEvent.click(boxes[2]!);
    expect(onToggle).toHaveBeenCalledWith("a3", true);
  });

  it("shows the agent description and an accent icon tile per name", () => {
    renderList();
    expect(screen.getByText("Finds vulnerabilities")).toBeInTheDocument();
    expect(screen.getByText("Security").closest("div[style*='border']")?.getAttribute("style")).toContain("var(--crit)");
  });

  it("truncates a long agent name behind an expand control", () => {
    renderList();
    expect(screen.getByText(LONG)).toHaveStyle({ textOverflow: "ellipsis" });
    expect(screen.getAllByRole("button", { name: "Show full text" }).length).toBeGreaterThan(0);
  });

  it("renders skeletons instead of rows while loading", () => {
    renderList({ loading: true });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
