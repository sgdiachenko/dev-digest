/* Shared fixtures for the eval dashboard tests: hook state, router state, builders, provider. */
import React from "react";
import { vi } from "vitest";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalOverview, EvalRunComparison, EvalSuiteRun, EvalSuiteRunSummary } from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import type { DashboardUrl } from "./EvalDashboardView/useDashboardUrl";

export const hookState = {
  overview: {} as Record<string, unknown>,
  runs: {} as Record<string, unknown>,
  run: {} as Record<string, unknown>,
  comparison: {} as Record<string, unknown>,
  runsCall: vi.fn(),
  startMutate: vi.fn(),
  startAllMutate: vi.fn(),
  cancelMutate: vi.fn(),
  refetchRuns: vi.fn(),
  refetchOverview: vi.fn(),
};

export const navState = { search: "", push: vi.fn(), replace: vi.fn() };

export const evalHooksMock = {
  useEvalOverview: () => hookState.overview,
  useEvalRuns: (...args: unknown[]) => {
    hookState.runsCall(...args);
    return hookState.runs;
  },
  useEvalRun: () => hookState.run,
  useEvalComparison: () => hookState.comparison,
  useStartEvalRun: () => ({ mutate: hookState.startMutate, isPending: false }),
  useStartAllEvalRuns: () => ({ mutate: hookState.startAllMutate, isPending: false }),
  useCancelEvalRun: () => ({ mutate: hookState.cancelMutate, isPending: false }),
};

export const navigationMock = {
  useSearchParams: () => new URLSearchParams(navState.search),
  useRouter: () => ({ push: navState.push, replace: navState.replace }),
};

export const appShellMock = {
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb?: { label: string }[] }) => (
    <div>
      <nav data-testid="crumb">{crumb?.map((c) => c.label).join(" › ")}</nav>
      {children}
    </div>
  ),
};

export function resetEvalState() {
  navState.search = "";
  for (const fn of [navState.push, navState.replace, ...Object.values(hookState).filter(vi.isMockFunction)]) {
    (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  hookState.overview = { data: undefined, isLoading: false, isError: false, refetch: hookState.refetchOverview };
  hookState.runs = { data: [], isLoading: false, isError: false, refetch: hookState.refetchRuns };
  hookState.run = { data: undefined };
  hookState.comparison = { data: undefined, isLoading: false, isError: false };
}

export function run(over: Partial<EvalSuiteRunSummary> & { id: string }): EvalSuiteRunSummary {
  return {
    agent_id: "a1",
    status: "completed",
    agent_version: 1,
    config: { provider: "openai", model: "gpt-4o", strategy: "single_pass", skills: [], temperature: 0 },
    case_ids: [],
    cases_total: 3,
    cases_completed: 3,
    cases_errored: 0,
    cases_passed: 2,
    recall: 0.7,
    precision: 0.9,
    citation_accuracy: 0.9,
    cost_usd: 0.012,
    duration_ms: 1000,
    started_at: "2026-05-29T09:14:00.000Z",
    finished_at: "2026-05-29T09:15:00.000Z",
    error_reason: null,
    ...over,
  } as EvalSuiteRunSummary;
}

export function fullRun(over: Partial<EvalSuiteRun> & { id: string; system_prompt?: string }): EvalSuiteRun {
  const { system_prompt = "prompt", ...rest } = over;
  const base = run({ id: over.id });
  return { ...base, config: { ...base.config, system_prompt }, per_case: [], ...rest } as EvalSuiteRun;
}

export function overviewOf(over: Partial<EvalOverview> = {}): EvalOverview {
  return { agents: [], recent_runs: [], ...over };
}

export function comparisonOf(over: Partial<EvalRunComparison> = {}): EvalRunComparison {
  return {
    a: fullRun({ id: "r2", agent_version: 2, started_at: "2026-05-27T16:40:00.000Z", system_prompt: "Return at most 5 findings" }),
    b: fullRun({
      id: "r3",
      agent_version: 3,
      started_at: "2026-05-29T09:14:00.000Z",
      recall: 0.75,
      precision: 0.85,
      citation_accuracy: 0.9,
      cost_usd: 0.23,
      system_prompt: "Return at most 3 findings",
    }),
    case_set: { added: [], removed: [] },
    flips: [],
    identical_config: false,
    ...over,
  } as EvalRunComparison;
}

export function makeUrl(over: Partial<DashboardUrl> = {}): DashboardUrl {
  return {
    agentId: "a1",
    compareIds: null,
    openAgent: vi.fn(),
    selectAgent: vi.fn(),
    backToOverview: vi.fn(),
    openCompare: vi.fn(),
    closeCompare: vi.fn(),
    ...over,
  };
}

export function renderEval(ui: React.ReactElement): RenderResult & { rerenderEval: (next: React.ReactElement) => void } {
  const wrap = (node: React.ReactElement) => (
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      {node}
    </NextIntlClientProvider>
  );
  const utils = render(wrap(ui));
  return { ...utils, rerenderEval: (next: React.ReactElement) => utils.rerender(wrap(next)) };
}
