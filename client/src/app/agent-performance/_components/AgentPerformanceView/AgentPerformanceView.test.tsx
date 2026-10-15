import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/agentPerformance.json";
import { AgentPerformanceView } from "./AgentPerformanceView";
import { perfOf, perfRow } from "../../testing";

const nav = vi.hoisted(() => {
  const state = { search: "", listeners: new Set<() => void>() };
  return {
    state,
    subscribe: (cb: () => void) => {
      state.listeners.add(cb);
      return () => void state.listeners.delete(cb);
    },
    replace: (url: string) => {
      state.search = url.split("?")[1] ?? "";
      state.listeners.forEach((l) => l());
    },
  };
});
vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    useRouter: () => ({ replace: nav.replace, push: nav.replace }),
    usePathname: () => "/agent-performance",
    useSearchParams: () => {
      const text = React.useSyncExternalStore(nav.subscribe, () => nav.state.search, () => nav.state.search);
      return new URLSearchParams(text);
    },
  };
});
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb, onRefresh }: { children: React.ReactNode; crumb?: { label: string }[]; onRefresh?: () => void }) => (
    <div>
      <div data-testid="crumb">{crumb?.map((c) => c.label).join(" › ")}</div>
      <button type="button" onClick={onRefresh}>
        Refresh
      </button>
      {children}
    </div>
  ),
}));

const NOW = Date.parse("2026-10-15T12:00:00.000Z");
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const fail = (status: number, message: string) => reply({ error: { code: "x", message } }, status);

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        <AgentPerformanceView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const urls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)));
const body = () => screen.getByTestId("dashboard-body");
const clock = (iso: string) =>
  new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  nav.state.search = "";
  nav.state.listeners.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  fetchMock.mockReset();
});

describe("AgentPerformanceView", () => {
  it("shows skeletons without figures and a disabled table header while loading (AC-170, AC-171, AC-100, AC-44)", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    show();
    expect(body().textContent).not.toMatch(/[0-9$]/);
    for (const b of within(body()).getAllByRole("button", { name: /^Sort by/ })) expect(b).toBeDisabled();
    expect(within(body()).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/Local review runs only/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("crumb")).toHaveTextContent("Agent Performance");
  });

  it("renders the figures, the update time and only ever sends GETs, also when sorting and expanding (AC-41, AC-54, AC-57, EC-18)", async () => {
    fetchMock.mockImplementation(() => reply(perfOf({ agents: [perfRow(), perfRow({ agent_id: "a2", agent_name: "Custom Mentor" })] })));
    show();
    expect(await screen.findByRole("region", { name: "Total runs (30 days)" })).toBeInTheDocument();
    expect(screen.getByText(`Updated ${clock("2026-10-15T12:00:00.000Z")}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Cost breakdown/ })).toBeInTheDocument();
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Sort by Runs" }));
    fireEvent.click(screen.getByRole("button", { name: "Show last runs of Custom Mentor" }));
    expect(fetchMock.mock.calls.length).toBe(before);
    for (const [, init] of fetchMock.mock.calls) expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
    expect(urls()[0]!.pathname).toBe("/agents/performance");
  });

  it("shows the error panel with the reason and Retry, and no figures (AC-173)", async () => {
    fetchMock.mockImplementation(() => fail(500, "boom"));
    show();
    expect(await screen.findByText("Couldn't load agent performance")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(within(body()).queryByText(/Total runs/)).not.toBeInTheDocument();
    fetchMock.mockImplementation(() => reply(perfOf()));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("region", { name: "Total runs (30 days)" })).toBeInTheDocument();
  });

  it("replaces the old figures with the error state after selecting another period (AC-174, EC-20)", async () => {
    fetchMock.mockImplementation(() => reply(perfOf()));
    show();
    await screen.findByRole("region", { name: "Total runs (30 days)" });
    fetchMock.mockImplementation(() => fail(500, "boom"));
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    expect(await screen.findByText("Couldn't load agent performance")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Total runs/ })).not.toBeInTheDocument();
    expect(nav.state.search).toContain("range=1d");
  });

  it("refreshes with a later period, ignores a second click in flight, and keeps the old figures with a banner on failure (AC-56, AC-42, AC-175)", async () => {
    fetchMock.mockImplementation(() => reply(perfOf()));
    show();
    await screen.findByRole("region", { name: "Total runs (30 days)" });
    const first = urls()[0]!.searchParams.get("to")!;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW + 60_000);
    fetchMock.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urls()[1]!.searchParams.get("to")! > first).toBe(true);
    expect(screen.getByRole("region", { name: "Total runs (30 days)" })).toBeInTheDocument();
  });

  it("keeps the old figures and reports the failed refresh in the status line (AC-175)", async () => {
    fetchMock.mockImplementation(() => reply(perfOf()));
    show();
    await screen.findByRole("region", { name: "Total runs (30 days)" });
    vi.setSystemTime(NOW + 60_000);
    fetchMock.mockImplementation(() => fail(500, "boom"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(`Couldn't refresh — showing data as of ${clock("2026-10-15T12:00:00.000Z")}`)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Total runs (30 days)" })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load agent performance")).not.toBeInTheDocument();
  });

  it("says the period is invalid on a 422 and shows no figures (AC-176)", async () => {
    fetchMock.mockImplementation(() => fail(422, "bad period"));
    show();
    expect(await screen.findByText("This period is invalid — choose another period")).toBeInTheDocument();
    expect(within(body()).queryByText(/Total runs/)).not.toBeInTheDocument();
    expect(within(body()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains an empty workspace: no agents and no reviews (AC-177, AC-178)", async () => {
    fetchMock.mockImplementation(() => reply(perfOf({ agents: [] }, { agent_count: 0 })));
    show();
    expect(await screen.findByText("No agents yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create agent" })).toHaveAttribute("href", "/agents");
    cleanup();
    fetchMock.mockImplementation(() => reply(perfOf({ agents: [] }, { workspace_last_run_at: null, runs: 0 })));
    show();
    expect(await screen.findByText("No reviews yet — run a review on a pull request")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pull Requests" })).toHaveAttribute("href", "/");
  });

  it("offers the last 30 days when a shorter period has no runs, and not when 30 days is selected (AC-179)", async () => {
    fetchMock.mockImplementation(() => reply(perfOf({ agents: [] }, { runs: 0 })));
    nav.state.search = new URLSearchParams({ range: "1d", from: "2026-10-14T12:00:00.000Z", to: "2026-10-15T12:00:00.000Z" }).toString();
    show();
    expect(await screen.findByText(/No runs in this period · last run/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show last 30 days" }));
    await waitFor(() => expect(nav.state.search).toContain("range=30d"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Show last 30 days" })).not.toBeInTheDocument());
    expect(screen.getByText(/No runs in this period/)).toBeInTheDocument();
  });
});
