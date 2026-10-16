import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { PeriodUrlState } from "../../../../../../../../lib/agent-stats/usePeriodUrl";
import { formatDate } from "../../../../../../../../lib/agent-stats/format";
import { skillKeys } from "../../../../../../../../lib/hooks/skills";
import { StatsTab } from "./StatsTab";
import {
  PERIOD,
  apiError,
  fetchMock,
  json,
  makeSkill,
  makeStats,
  newQueryClient,
  renderWithProviders,
  routeFetch,
} from "./testing";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.stubGlobal("fetch", fetchMock);

const STATS = "/skills/sk1/stats";

function periodState(over: Partial<PeriodUrlState> = {}): PeriodUrlState {
  return { period: PERIOD, option: "30d", notice: false, select: vi.fn(), refresh: vi.fn(), refreshFrom: null, ...over };
}

const mount = (state: PeriodUrlState, skill = makeSkill(), client = newQueryClient()) =>
  renderWithProviders(<StatsTab skill={skill} periodState={state} timeZone="UTC" />, client);

const cardOf = (label: string) => screen.getByText(label).closest("section") as HTMLElement;

beforeEach(() => {
  fetchMock.mockReset();
});
afterEach(cleanup);

describe("skill StatsTab", () => {
  it("shows the period, four cards, agents, categories and note, with GET requests only (AC-15, 18-24, 26, 27)", async () => {
    routeFetch({ [STATS]: () => json(makeStats({ runs_without_skill_data: 4 })) });
    mount(periodState());

    // AC-15: 30 days pressed, labels name the option, the resolved range is shown.
    expect(await screen.findByText("Pull frequency (30 days)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Accept rate (30 days)")).toBeInTheDocument();
    expect(screen.getByText("Findings (30 days)")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Findings by category (30 days)" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(formatDate(PERIOD.from, "en", "UTC")))).toBeInTheDocument();
    // AC-18
    expect(within(cardOf("Used by")).getByText("3 agents")).toBeInTheDocument();
    // AC-19 / AC-20
    const pull = cardOf("Pull frequency (30 days)");
    expect(within(pull).getByText("71%")).toBeInTheDocument();
    expect(within(pull).getByText("5 of 7 runs")).toBeInTheDocument();
    expect(
      within(pull).getByText(
        "4 runs without skill data are not included — runs recorded before skill tracking, and failed or cancelled runs",
      ),
    ).toBeInTheDocument();
    // AC-21: the hint opens on hover and on keyboard focus.
    const label = screen.getByText("Pull frequency (30 days)");
    fireEvent.focus(label);
    expect(within(pull).getByRole("tooltip")).toHaveTextContent("Share of linked agents' runs whose prompt included this skill");
    fireEvent.blur(label);
    fireEvent.mouseEnter(label.parentElement as HTMLElement);
    expect(within(pull).getByRole("tooltip")).toBeInTheDocument();
    // AC-22
    const accept = cardOf("Accept rate (30 days)");
    expect(within(accept).getByText("74%")).toBeInTheDocument();
    expect(within(accept).getByText("37 of 50 decided · 46 pending")).toBeInTheDocument();
    // AC-23
    expect(within(cardOf("Findings (30 days)")).getByText("96")).toBeInTheDocument();
    // AC-24: one row per agent, in the list's order, each with an accessible Open link.
    const panel = screen.getByRole("region", { name: "Agents using this skill" });
    const links = within(panel).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("aria-label"))).toEqual([
      "Open Custom Mentor",
      "Open Performance Reviewer",
      "Open Security Reviewer",
    ]);
    expect(links[0]).toHaveAttribute("href", "/agents/a1?tab=skills");
    // AC-26: counts and shares, no currency.
    const cat = screen.getByRole("region", { name: "Findings by category (30 days)" });
    expect(within(cat).getByText("security")).toBeInTheDocument();
    expect(within(cat).getByText("52")).toBeInTheDocument();
    expect(cat.textContent).not.toContain("$");
    // AC-27
    expect(
      screen.getByText(
        "Counted from local review runs whose prompt included this skill, including runs by agents no longer linked. A finding can't be traced to the skill that caused it.",
      ),
    ).toBeInTheDocument();
    // AC-32: Updated HH:MM in a polite status region.
    expect(screen.getByRole("status")).toHaveTextContent("Updated 12:00");
    // AC-17 / skill NFR-4: GET only.
    for (const [, init] of fetchMock.mock.calls) expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("names 'Used by' and 'Agents using this skill' exactly as the catalog, with no text-transform (C26, AC-40)", async () => {
    routeFetch({ [STATS]: () => json(makeStats()) });
    mount(periodState());
    const used = await screen.findByText("Used by");
    const title = screen.getByRole("heading", { name: "Agents using this skill" });
    for (const el of [used, title]) expect(getComputedStyle(el).textTransform).not.toBe("uppercase");
    expect(document.body.textContent).toContain("Used by");
    expect(document.body.textContent).toContain("Agents using this skill");
  });

  it("shows the period of a custom range in the labels and thousands separators for large counts (AC-15, EC-21)", async () => {
    routeFetch({ [STATS]: () => json(makeStats({ findings: 1234, findings_30d: 1234, by_category: [{ category: "bug", count: 1234 }] })) });
    mount(periodState({ option: "custom", period: { ...PERIOD, option: "custom" } }));
    expect(await screen.findByText("Findings (custom range)")).toBeInTheDocument();
    expect(within(cardOf("Findings (custom range)")).getByText("1,234")).toBeInTheDocument();
  });

  it("shows skeletons with no digit or currency sign while the first read is in flight (AC-29)", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = mount(periodState());
    const busy = container.querySelectorAll('[aria-busy="true"]');
    expect(busy.length).toBeGreaterThanOrEqual(2);
    for (const el of busy) expect(el.textContent).not.toMatch(/[0-9$]/);
    expect(screen.queryByText("Used by")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toBeInTheDocument();
  });

  it("explains a failed read with the reason and a Retry; a period change then 500 shows no old figures (AC-30)", async () => {
    const client = newQueryClient();
    routeFetch({ [STATS]: () => json(makeStats()) });
    const view = mount(periodState(), makeSkill(), client);
    expect(await screen.findByText("Used by")).toBeInTheDocument();

    routeFetch({ [STATS]: () => apiError(500, "boom", "database is down") });
    const next = { ...PERIOD, from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T00:00:00.000Z" };
    view.unmount();
    renderWithProviders(<StatsTab skill={makeSkill()} periodState={periodState({ period: next })} timeZone="UTC" />, client);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Couldn't load this skill's stats")).toBeInTheDocument();
    expect(within(alert).getByText("database is down")).toBeInTheDocument();
    expect(screen.queryByText("Used by")).not.toBeInTheDocument();

    routeFetch({ [STATS]: () => json(makeStats()) });
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Used by")).toBeInTheDocument();
  });

  it("answers a 422 with the invalid-period notice and no figures (AC-30)", async () => {
    routeFetch({ [STATS]: () => apiError(422, "validation", "bad period") });
    mount(periodState());
    expect(await screen.findByText("This period is invalid — choose another period")).toBeInTheDocument();
    expect(screen.queryByText("Used by")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the link-notice when the URL's period was invalid (AC-15)", async () => {
    routeFetch({ [STATS]: () => json(makeStats()) });
    mount(periodState({ notice: true }));
    expect(await screen.findByText("The link's period was invalid — showing the last 30 days")).toBeInTheDocument();
  });

  it("answers a 404 with 'This skill no longer exists' and a link to /skills (AC-31, EC-15)", async () => {
    routeFetch({ [STATS]: () => apiError(404, "not_found", "Skill not found") });
    mount(periodState());
    expect(await screen.findByText("This skill no longer exists")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Skills" })).toHaveAttribute("href", "/skills");
    expect(screen.queryByText("Used by")).not.toBeInTheDocument();
  });

  it("keeps the figures with a 'Couldn't refresh' banner when a refresh fails (AC-32, EC-18)", async () => {
    const client = newQueryClient();
    routeFetch({ [STATS]: () => json(makeStats()) });
    mount(periodState(), makeSkill(), client);
    expect(await screen.findByText("Used by")).toBeInTheDocument();

    routeFetch({ [STATS]: () => apiError(500, "boom", "down") });
    await client.refetchQueries({ queryKey: skillKeys.stats("sk1") });
    const status = await screen.findByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("Couldn't refresh — showing data as of 12:00"));
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(within(status).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows 'No usage yet' instead of cards, panels and note when nothing is linked and no run used the skill (AC-33)", async () => {
    routeFetch({
      [STATS]: () =>
        json(makeStats({ agent_count: 0, agents: [], skill_runs: 0, pull_pct: null, pull_runs: 0, pull_runs_total: 0, accept_pct: null, accept_rate: null, findings: 0, by_category: [], accepted: 0, dismissed: 0, pending: 0 })),
    });
    mount(periodState());
    expect(
      await screen.findByText("No usage yet — this skill isn't linked to any agent. Link it to an agent to start collecting stats."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Used by")).not.toBeInTheDocument();
    expect(screen.queryByText("Agents using this skill")).not.toBeInTheDocument();
    expect(screen.queryByText(/Counted from local review runs/)).not.toBeInTheDocument();
  });

  it("shows the no-runs state with the last use date, keeps the agents panel and offers 'Show last 30 days' (AC-34)", async () => {
    const select = vi.fn();
    routeFetch({
      [STATS]: () =>
        json(makeStats({ skill_runs: 0, pull_pct: null, pull_runs: 0, pull_runs_total: 0, findings: 0, by_category: [], accept_rate: null, accept_pct: null, accepted: 0, dismissed: 0, pending: 0 })),
    });
    mount(periodState({ option: "1d", period: { ...PERIOD, option: "1d" }, select }));
    expect(
      await screen.findByText(`No runs used this skill in this period · last used ${formatDate("2026-10-14T09:00:00.000Z", "en", "UTC")}`),
    ).toBeInTheDocument();
    expect(screen.queryByText("Used by")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Findings by category/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agents using this skill" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show last 30 days" }));
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ option: "30d" }));
  });

  it("says 'not used yet' with no last use and hides 'Show last 30 days' on 30 days (AC-34)", async () => {
    routeFetch({
      [STATS]: () => json(makeStats({ skill_runs: 0, pull_runs: 0, pull_runs_total: 0, last_used_at: null, findings: 0, by_category: [] })),
    });
    mount(periodState());
    expect(await screen.findByText("No runs used this skill in this period · not used yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show last 30 days" })).not.toBeInTheDocument();
  });

  it("shows the disabled hint only for a disabled skill (AC-28, EC-4)", async () => {
    routeFetch({ [STATS]: () => json(makeStats()) });
    mount(periodState(), makeSkill({ enabled: false }));
    expect(await screen.findByText("This skill is disabled — linked agents' runs don't load it")).toBeInTheDocument();
    cleanup();
    mount(periodState(), makeSkill({ enabled: true }));
    await screen.findByText("Used by");
    expect(screen.queryByText(/This skill is disabled/)).not.toBeInTheDocument();
  });

  it("explains an unlinked-only skill: figures from runs of agents that are no longer linked (AC-25, EC-2)", async () => {
    routeFetch({ [STATS]: () => json(makeStats({ agent_count: 0, agents: [] })) });
    mount(periodState());
    expect(
      await screen.findByText("Not linked to any agent — the figures come from runs of agents that are no longer linked"),
    ).toBeInTheDocument();
    expect(within(cardOf("Used by")).getByText("0 agents")).toBeInTheDocument();
  });
});
