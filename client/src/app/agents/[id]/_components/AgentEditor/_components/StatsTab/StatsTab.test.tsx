import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { PeriodUrlState } from "../../../../../../../lib/agent-stats/usePeriodUrl";
import { agentStatsKeys } from "../../../../../../../lib/hooks/agent-stats";
import { StatsTab } from "./StatsTab";
import {
  PERIOD,
  apiError,
  callsTo,
  fetchMock,
  json,
  makePage,
  makeStats,
  newQueryClient,
  renderWithProviders,
  routeFetch,
} from "./testing";

vi.stubGlobal("fetch", fetchMock);

const STATS = "/agents/ag1/stats";
const RUNS = "/agents/ag1/stats/runs";

function periodState(over: Partial<PeriodUrlState> = {}): PeriodUrlState {
  return { period: PERIOD, option: "30d", notice: false, select: vi.fn(), refresh: vi.fn(), refreshFrom: null, ...over };
}

const mount = (state: PeriodUrlState, onAgentNotFound = vi.fn(), client = newQueryClient()) =>
  renderWithProviders(<StatsTab agentId="ag1" periodState={state} onAgentNotFound={onAgentNotFound} timeZone="UTC" />, client);

beforeEach(() => {
  fetchMock.mockReset();
});
afterEach(cleanup);

describe("StatsTab", () => {
  it("shows the cards, skills, findings panels and run history for a period, with GET requests only", async () => {
    routeFetch({ [STATS]: () => json(makeStats()), [RUNS]: () => json(makePage(1, 2, 2)) });
    mount(periodState());

    // AC-54 / AC-144: runs card, failed and cancelled split.
    expect(await screen.findByRole("region", { name: "Total runs (30 days)" })).toBeInTheDocument();
    expect(screen.getByText("2 failed · 1 cancelled")).toBeInTheDocument();
    // AC-100: local runs only.
    expect(screen.getByText(/Local review runs only/)).toBeInTheDocument();
    // AC-145 / AC-142: avg cost, delta against the previous period, cost label.
    const costCard = screen.getByRole("region", { name: "Avg cost / run" });
    expect(within(costCard).getByText("$0.038")).toBeInTheDocument();
    expect(within(costCard).getByText("↓ $0.0070 vs previous 30 days")).toBeInTheDocument();
    expect(within(costCard).getByText("Recorded by DevDigest — not provider billing")).toBeInTheDocument();
    // AC-146 / AC-147.
    expect(screen.getByText("6.2 s")).toBeInTheDocument();
    const acceptCard = screen.getByRole("region", { name: "Accept rate" });
    expect(within(acceptCard).getByText("8 of 12 decided · 2 pending")).toBeInTheDocument();
    expect(within(acceptCard).getAllByText("67%").length).toBeGreaterThan(0);
    // AC-148 / AC-149.
    const skills = screen.getByRole("region", { name: "Most-used skills" });
    expect(within(skills).getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(within(skills).getByText("100%")).toBeInTheDocument();
    expect(within(skills).getByText("67%")).toBeInTheDocument();
    expect(within(skills).getByText("33%")).toBeInTheDocument();
    expect(within(skills).getByText(/^Based on 9 of 13 runs — /)).toBeInTheDocument();
    // AC-152: legend; AC-153: dates and counts in the accessible name and on focus.
    const severity = screen.getByRole("region", { name: "Findings by severity" });
    for (const word of ["Critical", "Warning", "Suggestion"]) expect(within(severity).getByText(word)).toBeInTheDocument();
    expect(within(severity).getAllByRole("img")).toHaveLength(2);
    const bar = within(severity).getByRole("img", { name: "Oct 13, 2026: 1 critical, 2 warning, 3 suggestion" });
    fireEvent.focus(bar);
    expect(within(severity).getByRole("tooltip")).toHaveTextContent("Oct 13, 2026: 1 critical, 2 warning, 3 suggestion");
    // AC-154: counts, no currency sign.
    const category = screen.getByRole("region", { name: "Findings by category" });
    expect(within(category).getByText("security")).toBeInTheDocument();
    expect(within(category).getByText("6")).toBeInTheDocument();
    expect(category.textContent).not.toContain("$");
    // Updated status and the run history section.
    expect(screen.getByText("Updated 12:00")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Run history" })).toBeInTheDocument();
    // AC-41.
    for (const [, init] of fetchMock.mock.calls) expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
  });

  it("shows skeletons without digits or currency while loading (AC-172)", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = mount(periodState());
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy!.textContent).not.toMatch(/[0-9$]/);
    expect(screen.queryByText("Total runs (30 days)")).toBeNull();
  });

  it("shows the load error with Retry, the invalid-period text for 422 and calls back once for 404", async () => {
    routeFetch({ [STATS]: () => apiError(500, "internal", "boom") });
    mount(periodState());
    expect(await screen.findByText("Couldn't load this agent's stats")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("Total runs (30 days)")).toBeNull();
    cleanup();

    routeFetch({ [STATS]: () => apiError(422, "validation_error", "bad period") });
    mount(periodState());
    expect(await screen.findByText("This period is invalid — choose another period")).toBeInTheDocument();
    cleanup();

    routeFetch({ [STATS]: () => apiError(404, "not_found", "no such agent") });
    const onAgentNotFound = vi.fn();
    const { container } = mount(periodState(), onAgentNotFound);
    await waitFor(() => expect(onAgentNotFound).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("explains an agent that never ran and a period without runs", async () => {
    routeFetch({ [STATS]: () => json(makeStats({ last_run_at: null, runs: 0 })) });
    mount(periodState());
    expect(await screen.findByText("This agent hasn't run yet")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Run history" })).toBeNull();
    cleanup();

    routeFetch({ [STATS]: () => json(makeStats({ runs: 0 })) });
    const select = vi.fn();
    mount(periodState({ option: "1d", select }));
    expect(await screen.findByText("No runs in this period · last run Oct 14, 2026")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Run history" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show last 30 days" }));
    expect(select).toHaveBeenCalledTimes(1);
    expect(select.mock.calls[0]![0]).toMatchObject({ option: "30d" });
  });

  it("covers unknown costs, a small sample, a missing duration, a deleted skill and no skill data", async () => {
    routeFetch({
      [STATS]: () =>
        json(
          makeStats({
            unknown_cost_runs: 2,
            avg_duration_ms: null,
            small_sample: true,
            skills_usage: {
              runs_with_skill_data: 2,
              runs_without_skill_data: 0,
              skills: [{ skill_id: "gone", skill_name: null, runs: 2 }],
            },
          }),
        ),
      [RUNS]: () => json(makePage(1, 1, 1)),
    });
    mount(periodState());
    expect(await screen.findByText("cost unknown for 2 runs")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Avg duration" })).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Accept rate" })).getByText("small sample")).toBeInTheDocument();
    expect(screen.getByText("Deleted skill")).toBeInTheDocument();
    cleanup();

    routeFetch({
      [STATS]: () => json(makeStats({ skills_usage: { runs_with_skill_data: 0, runs_without_skill_data: 5, skills: [] } })),
      [RUNS]: () => json(makePage(1, 1, 1)),
    });
    mount(periodState());
    expect(await screen.findByText("No skill data for this period")).toBeInTheDocument();
  });

  it("says there are no findings in both findings panels and groups categories beyond five into Other", async () => {
    routeFetch({
      [STATS]: () =>
        json(
          makeStats({
            findings_by_severity: [{ bucket_start: "2026-10-13T00:00:00.000Z", CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }],
            findings_by_category: [],
          }),
        ),
      [RUNS]: () => json(makePage(1, 1, 1)),
    });
    mount(periodState());
    expect(await screen.findAllByText("No findings in this period")).toHaveLength(2);
    cleanup();

    const categories = ["a", "b", "c", "d", "e", "f", "g"].map((category, i) => ({ category, count: 10 - i }));
    routeFetch({ [STATS]: () => json(makeStats({ findings_by_category: categories })), [RUNS]: () => json(makePage(1, 1, 1)) });
    mount(periodState());
    const panel = await screen.findByRole("region", { name: "Findings by category" });
    expect(within(panel).getByText("Other")).toBeInTheDocument();
    expect(within(panel).queryByText("g")).toBeNull();
  });

  it("keeps the previous period's figures with a refresh banner when a refresh read fails (AC-175)", async () => {
    const refreshFrom = { option: "30d" as const, from: "2026-09-14T12:00:00.000Z", to: "2026-10-14T12:00:00.000Z" };
    const client = newQueryClient();
    client.setQueryData(agentStatsKeys.stats("ag1", refreshFrom), makeStats());
    routeFetch({ [STATS]: () => apiError(500, "internal", "boom"), [RUNS]: () => json(makePage(1, 1, 1)) });
    mount(periodState({ refreshFrom }), vi.fn(), client);

    expect(await screen.findByText("Couldn't refresh — showing data as of 12:00")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Total runs (30 days)" })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load this agent's stats")).toBeNull();
    expect(callsTo(STATS).length).toBeGreaterThan(0);
  });
});
