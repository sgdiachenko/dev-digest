import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import { renderWithMessages } from "@/components/agent-stats/renderWithMessages";
import { AgentsTable } from "./AgentsTable";
import { perfRow } from "../../testing";

afterEach(cleanup);

const ASOF = "2026-10-15T12:00:00.000Z";
const PERIOD = { option: "30d" as const, from: "2026-09-15T12:00:00.000Z", to: ASOF };
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const row = (name: string, over: Parameters<typeof perfRow>[0] = {}) => perfRow({ agent_id: `id-${name}`, agent_name: name, ...over });
const show = (rows: ReturnType<typeof row>[], pending = false) =>
  renderWithMessages(<AgentsTable rows={rows} asOf={ASOF} period={PERIOD} pending={pending} />);
const order = () => screen.getAllByRole("link").map((a) => a.getAttribute("aria-label"));

describe("AgentsTable", () => {
  it("renders headers, formatted cells and the View link with the screen's period (AC-110, AC-117-AC-119, AC-191, NFR-11)", () => {
    show([row("Security Reviewer")]);
    for (const h of ["Agent", "Runs", "Avg cost", "Avg duration", "Accept rate", "Last run"]) {
      expect(screen.getByRole("button", { name: `Sort by ${h}` }).closest("th")).toBeInTheDocument();
    }
    expect(document.querySelectorAll("th[aria-sort] > button")).toHaveLength(6);
    expect(screen.getByText("Recorded by DevDigest — not provider billing")).toBeInTheDocument();
    expect(screen.getByText("$0.038")).toBeInTheDocument();
    expect(screen.getByText("6.2 s")).toBeInTheDocument();
    expect(screen.getByText("78% · 39/50")).toBeInTheDocument();
    expect(screen.getByText("↑", { selector: "[role=img]" })).toHaveAttribute("aria-label", "up 3 points vs previous period");
    const href = screen.getByRole("link", { name: "View Security Reviewer stats" }).getAttribute("href")!;
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/agents/id-Security%20Reviewer");
    expect(url.searchParams.get("tab")).toBe("stats");
    expect(url.searchParams.get("range")).toBe("30d");
    expect(url.searchParams.get("from")).toBe(PERIOD.from);
    expect(url.searchParams.get("to")).toBe(PERIOD.to);
  });

  it("shows dashes for a 0-run row, the small-sample text, Never and the Deleted row without View (AC-111-AC-113, AC-118, AC-120, EC-1, EC-4, EC-48)", () => {
    show([
      row("Idle", { runs: 0, avg_cost_usd: null, avg_duration_ms: null, accept_rate: null, accepted: 0, dismissed: 0, pending: 0, last_run_at: null, previous_accept_rate: null }),
      row("Tiny", { accept_rate: 0.6, small_sample: true, accepted: 3, dismissed: 2 }),
      perfRow({ agent_id: null, agent_name: null, accept_rate: 0.5, accepted: 5, dismissed: 5 }),
    ]);
    const idle = screen.getByText("Idle").closest("tr")!;
    expect(within(idle).getByText("0")).toBeInTheDocument();
    expect(within(idle).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(within(idle).getByText("0 decided")).toBeInTheDocument();
    expect(within(idle).getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("60% · 5/10 decisions — small sample")).toBeInTheDocument();
    const deleted = screen.getByText("Deleted agent").closest("tr")!;
    expect(within(deleted).queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the breakdown on focus and hover, and the relative time with the full date on focus (AC-114, AC-118, EC-27, EC-32)", () => {
    show([row("A")]);
    fireEvent.focus(screen.getByText("78% · 39/50").parentElement!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("39 accepted · 11 dismissed · 3 pending");
    cleanup();
    show([row("A")]);
    const last = screen.getByText("4 minutes ago");
    fireEvent.focus(last);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/2026/);
  });

  it("sorts Accept descending first and toggles by header click without a request (AC-121, AC-122)", () => {
    show([row("Low", { accept_rate: 0.3 }), row("High", { accept_rate: 0.9 })]);
    expect(order()).toEqual(["View High stats", "View Low stats"]);
    const accept = screen.getByRole("button", { name: "Sort by Accept rate" }).closest("th")!;
    expect(accept).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(within(accept).getByRole("button"));
    expect(accept).toHaveAttribute("aria-sort", "ascending");
    expect(order()).toEqual(["View Low stats", "View High stats"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Agent" }));
    expect(order()).toEqual(["View High stats", "View Low stats"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("expands a row with a sparkline and caption, or a text for 0 and 1 runs, without a request (AC-128-AC-131)", () => {
    const run = (id: string, ms: number, cost: number | null) => ({ run_id: id, ran_at: ASOF, duration_ms: ms, cost_usd: cost });
    show([
      row("Many", { last_runs: [run("1", 5000, 0.03), run("2", 7400, 0.042)] }),
      row("NoCost", { last_runs: [run("3", 5000, null), run("4", 5000, null)] }),
      row("One", { last_runs: [run("5", 5000, 0.01)] }),
      row("Zero", { last_runs: [] }),
    ]);
    for (const n of ["Many", "NoCost", "One", "Zero"]) {
      const btn = screen.getByRole("button", { name: `Show last runs of ${n}` });
      expect(btn).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(btn);
      expect(screen.getByRole("button", { name: `Hide last runs of ${n}` })).toHaveAttribute("aria-expanded", "true");
    }
    expect(screen.getByText("last 2 runs · avg 6.2 s · $0.036")).toBeInTheDocument();
    expect(screen.getByText("last 2 runs · avg 5.0 s · —")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Run durations/ })).toHaveLength(2);
    expect(screen.getByText("Not enough runs for a trend")).toBeInTheDocument();
    expect(screen.getByText("No finished runs in this period")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the agent's Stats tab, with the screen's period, from the expanded run chart; the Deleted agent has none", () => {
    const run = (id: string, ms: number) => ({ run_id: id, ran_at: ASOF, duration_ms: ms, cost_usd: 0.01 });
    const twoRuns = [run("1", 5000), run("2", 7000)];
    show([row("Many", { last_runs: twoRuns }), perfRow({ agent_id: null, agent_name: null, last_runs: twoRuns })]);
    for (const b of screen.getAllByRole("button", { name: /Show last runs of/ })) fireEvent.click(b);

    const chart = screen.getByRole("link", { name: "Open the stats of Many from its run chart" });
    const url = new URL(chart.getAttribute("href")!, "http://x");
    expect(url.pathname).toBe("/agents/id-Many");
    expect(url.searchParams.get("tab")).toBe("stats");
    expect(url.searchParams.get("from")).toBe(PERIOD.from);
    expect(url.searchParams.get("to")).toBe(PERIOD.to);
    // Both charts render, but only the live agent's is a link.
    expect(screen.getAllByRole("img", { name: /Run durations/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /from its run chart/ })).toHaveLength(1);
    // The View link keeps its own name, so it stays unambiguous.
    expect(screen.getAllByRole("link", { name: "View Many stats" })).toHaveLength(1);
  });

  it("renders at most 200 rows and says how many agents there are (NFR-7, EC-47)", () => {
    show(Array.from({ length: 250 }, (_, i) => row(`agent-${String(i).padStart(3, "0")}`)));
    expect(screen.getAllByRole("link")).toHaveLength(200);
    expect(screen.getByText("Showing 200 of 250 agents")).toBeInTheDocument();
  });

  it("renders disabled sort buttons and no rows while pending (AC-171)", () => {
    show([row("A")], true);
    for (const b of document.querySelectorAll("th > button")) expect(b).toBeDisabled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
