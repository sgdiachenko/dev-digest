import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import results from "../../../../../../../../messages/en/multiAgentResults.json";
import common from "../../../../../../../../messages/en/common.json";
import { ColumnsView } from "./ColumnsView";

const col = (run_id: string, name: string, status: AgentColumn["status"]): AgentColumn => ({
  run_id,
  agent_id: `a-${run_id}`,
  agent_name: name,
  provider: null,
  model: null,
  status,
  error: null,
  verdict: null,
  score: null,
  summary: null,
  duration_ms: null,
  cost_usd: null,
  findings: [],
});

const view = (columns: AgentColumn[]) => (
  <NextIntlClientProvider locale="en" messages={{ multiAgentResults: results, common }}>
    <ColumnsView columns={columns} onOpenTrace={vi.fn()} />
  </NextIntlClientProvider>
);

afterEach(cleanup);

describe("ColumnsView", () => {
  it("renders one card per column and keeps a polite live region in sync with the statuses", () => {
    const { rerender } = render(view([col("r1", "Security", "running"), col("r2", "Style", "done")]));
    expect(screen.getAllByRole("button", { name: "View trace" })).toHaveLength(2);
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("Security: Running. Style: Done");

    rerender(view([col("r1", "Security", "done"), col("r2", "Style", "done")]));
    expect(screen.getByRole("status").textContent).toBe("Security: Done. Style: Done");
  });
});
