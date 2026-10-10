import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import results from "../../../../../../../../messages/en/multiAgentResults.json";
import { AgentTabs } from "./AgentTabs";

const col = (run_id: string, name: string): AgentColumn => ({
  run_id,
  agent_id: `a-${run_id}`,
  agent_name: name,
  provider: null,
  model: null,
  status: "done",
  error: null,
  verdict: null,
  score: null,
  summary: null,
  duration_ms: null,
  cost_usd: null,
  findings: [],
});
const columns = [col("r1", "Security"), col("r2", "Style"), col("r3", "Perf")];

afterEach(cleanup);

describe("AgentTabs", () => {
  it("exposes tab roles, a roving tabIndex and arrow, Home and End keys", () => {
    const onSelect = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results }}>
        <AgentTabs columns={columns} selectedRunId="r2" onSelect={onSelect} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("tablist", { name: "Agents" })).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);

    fireEvent.keyDown(tabs[1]!, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("r3");
    fireEvent.keyDown(tabs[1]!, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith("r1");
    fireEvent.keyDown(tabs[1]!, { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith("r1");
    fireEvent.keyDown(tabs[1]!, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith("r3");
    expect(document.activeElement).toBe(tabs[2]);

    fireEvent.click(tabs[0]!);
    expect(onSelect).toHaveBeenLastCalledWith("r1");
  });

  it("shows the score number beside the agent name, coloured by band", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results }}>
        <AgentTabs columns={[{ ...col("r1", "Security"), score: 38 }, col("r2", "Style")]} selectedRunId="r1" onSelect={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]!.textContent).toBe("Security38");
    expect(screen.getByText("38").style.color).toBe("var(--crit)");
    expect(tabs[1]!.textContent).toBe("Style");
  });
});
