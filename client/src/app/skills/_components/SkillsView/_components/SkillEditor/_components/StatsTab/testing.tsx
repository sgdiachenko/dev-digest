/* Shared fixtures for the skill StatsTab tests: a fetch router, providers (with the skills and
   agentPerformance catalogs) and typed builders. */
import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import agentPerformance from "../../../../../../../../../messages/en/agentPerformance.json";
import skills from "../../../../../../../../../messages/en/skills.json";

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

export const newQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });

export function renderWithProviders(ui: React.ReactElement, client: QueryClient = newQueryClient()): RenderResult {
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ skills, agentPerformance }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

export const PERIOD = { option: "30d" as const, from: "2026-09-15T12:00:00.000Z", to: "2026-10-15T12:00:00.000Z" };

export function makeSkill(over: Partial<Skill> = {}): Skill {
  return {
    id: "sk1",
    name: "pr-quality-rubric",
    description: "Rubric",
    type: "rubric",
    source: "manual",
    body: "# Rubric",
    enabled: true,
    version: 5,
    evidence_files: null,
    ...over,
  };
}

export const AGENTS = [
  { id: "a1", name: "Custom Mentor" },
  { id: "a2", name: "Performance Reviewer" },
  { id: "a3", name: "Security Reviewer" },
];

/** 3 agents, pull 5 of 7 (71%), accept 37 of 50 decided (74%), 96 findings. */
export function makeStats(over: Partial<SkillStats> = {}): SkillStats {
  return {
    agent_count: 3,
    agents: AGENTS,
    pull_pct: 71,
    accept_pct: 74,
    findings_30d: 96,
    by_category: [
      { category: "security", count: 52 },
      { category: "bug", count: 20 },
      { category: "perf", count: 16 },
      { category: "style", count: 8 },
    ],
    findings: 96,
    skill_runs: 7,
    pull_runs: 5,
    pull_runs_total: 7,
    runs_without_skill_data: 0,
    accepted: 37,
    dismissed: 13,
    pending: 46,
    accept_rate: 0.74,
    small_sample: false,
    last_used_at: "2026-10-14T09:00:00.000Z",
    period: { from: PERIOD.from, to: PERIOD.to },
    as_of: "2026-10-15T12:00:00.000Z",
    ...over,
  };
}
