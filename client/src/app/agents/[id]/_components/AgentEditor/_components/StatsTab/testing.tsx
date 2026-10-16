/* Shared fixtures for the StatsTab tests: a fetch router, providers (with the agentPerformance catalog)
   and typed builders. */
import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { AgentRunHistoryItem, AgentRunHistoryPage, AgentStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agentPerformance.json";

export const fetchMock = vi.fn();

export const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

export const apiError = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

type Handler = (url: URL) => Promise<Response>;

/** Routes `fetch` by pathname; an unrouted request fails the test loudly. */
export function routeFetch(routes: Record<string, Handler>) {
  fetchMock.mockImplementation((url: string) => {
    const u = new URL(url);
    const handler = routes[u.pathname];
    if (!handler) throw new Error(`unrouted request: ${u.pathname}`);
    return handler(u);
  });
}

export const callsTo = (pathname: string) =>
  fetchMock.mock.calls.filter(([url]) => new URL(url as string).pathname === pathname);

export const newQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });

export function renderWithProviders(ui: React.ReactElement, client: QueryClient = newQueryClient()): RenderResult {
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

export const PERIOD = { option: "30d" as const, from: "2026-09-15T12:00:00.000Z", to: "2026-10-15T12:00:00.000Z" };

export function makeStats(over: Partial<AgentStats> = {}): AgentStats {
  return {
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    enabled: true,
    period: { from: PERIOD.from, to: PERIOD.to, previous_from: "2026-08-16T12:00:00.000Z", previous_to: PERIOD.from },
    as_of: "2026-10-15T12:00:00.000Z",
    runs: 13,
    failed: 2,
    cancelled: 1,
    total_cost_usd: 0.38,
    avg_cost_usd: 0.038,
    previous_avg_cost_usd: 0.045,
    unknown_cost_runs: 0,
    avg_duration_ms: 6200,
    accepted: 8,
    dismissed: 4,
    pending: 2,
    accept_rate: 8 / 12,
    small_sample: false,
    previous_accept_rate: null,
    previous_small_sample: false,
    last_run_at: "2026-10-14T09:00:00.000Z",
    last_runs: [],
    runs_trend: [
      { bucket_start: "2026-10-13T00:00:00.000Z", runs: 4 },
      { bucket_start: "2026-10-14T00:00:00.000Z", runs: 9 },
    ],
    findings_by_severity: [
      { bucket_start: "2026-10-13T00:00:00.000Z", CRITICAL: 1, WARNING: 2, SUGGESTION: 3 },
      { bucket_start: "2026-10-14T00:00:00.000Z", CRITICAL: 0, WARNING: 4, SUGGESTION: 1 },
    ],
    findings_by_category: [
      { category: "security", count: 6 },
      { category: "bug", count: 3 },
    ],
    skills_usage: {
      runs_with_skill_data: 9,
      runs_without_skill_data: 4,
      skills: [
        { skill_id: "s1", skill_name: "secret-leakage-gate", runs: 9 },
        { skill_id: "s2", skill_name: "lethal-trifecta", runs: 6 },
        { skill_id: "s3", skill_name: "pr-quality-rubric", runs: 3 },
      ],
    },
    ...over,
  };
}

export function makeRun(i: number, over: Partial<AgentRunHistoryItem> = {}): AgentRunHistoryItem {
  return {
    run_id: `run-${i}`,
    ran_at: `2026-10-14T09:${String(i % 60).padStart(2, "0")}:00.000Z`,
    status: "done",
    repo_id: "repo-1",
    repo_full_name: "acme/payments-api",
    pr_number: 479,
    tokens_in: 10_000,
    tokens_out: 6_000,
    cost_usd: 0.06,
    findings_count: 3,
    ...over,
  };
}

export function makePage(page: number, count: number, total: number, over: Partial<AgentRunHistoryItem> = {}): AgentRunHistoryPage {
  return {
    items: Array.from({ length: count }, (_, i) => makeRun((page - 1) * 20 + i, over)),
    page,
    page_size: 20,
    total,
  };
}
