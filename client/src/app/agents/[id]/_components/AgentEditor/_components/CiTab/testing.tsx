/* Shared fixtures for the CiTab and ExportCiWizard tests: a fetch router, providers, and typed builders. */
import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiFile, CiInstallation, CiRun, Repo } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";

export const fetchMock = vi.fn();

export const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

export const apiError = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

type Handler = (init: RequestInit | undefined) => Promise<Response>;

/** Routes `fetch` by "METHOD /path"; an unrouted request fails the test loudly. */
export function routeFetch(routes: Record<string, Handler>) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
    const handler = routes[key];
    if (!handler) throw new Error(`unrouted request: ${key}`);
    return handler(init);
  });
}

export const callsTo = (key: string) =>
  fetchMock.mock.calls.filter(([url, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${new URL(url as string).pathname}` === key);

export const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));

export function renderWithProviders(ui: React.ReactElement): RenderResult {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

export function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: "ag1",
    name: "Security Reviewer",
    description: "",
    provider: "openrouter",
    model: "deepseek/deepseek-chat",
    system_prompt: "p",
    output_schema: null,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    enabled: true,
    version: 3,
    ...over,
  };
}

export function makeRun(over: Partial<CiRun> = {}): CiRun {
  return {
    id: "run1",
    ci_installation_id: "i1",
    repo: "acme/payments-api",
    pr_number: 482,
    head_sha: "0123456789abcdef0123456789abcdef01234567",
    workflow_run_id: 9001,
    run_attempt: 1,
    ran_at: new Date(Date.now() - 4 * 60_000).toISOString(),
    duration_s: 42,
    status: "succeeded",
    verdict: "comment",
    findings_count: 3,
    critical: 1,
    warning: 1,
    suggestion: 1,
    cost_usd: 0.06,
    agent: "Security Reviewer",
    agent_version: 3,
    github_url: "https://github.com/acme/payments-api/actions/runs/9001",
    source: "gha",
    unavailable_reason: null,
    model: "deepseek/deepseek-chat",
    ci_fail_on: "critical",
    skills: [],
    memory_sha256: null,
    manifest_sha256: "a".repeat(64),
    runner_build: "b".repeat(64),
    differs_from_export: false,
    ...over,
  };
}

export function makeInstallation(over: Partial<CiInstallation> = {}): CiInstallation {
  return {
    id: "i1",
    agent_id: "ag1",
    repo: "acme/payments-api",
    target_type: "gha",
    installed_at: "2026-10-01T00:00:00Z",
    agent_version: 3,
    ci_fail_on: "critical",
    post_as: "github_review",
    triggers: ["opened", "synchronize", "reopened"],
    workflow_path: ".github/workflows/devdigest-review.yml",
    pr_url: "https://github.com/acme/payments-api/pull/7",
    outdated: false,
    pending_update: false,
    latest_run: null,
    exported_model: "deepseek/deepseek-chat",
    exported_skills: [],
    ...over,
  };
}

export function makeRepo(fullName: string, id = fullName): Repo {
  const [owner, name] = fullName.split("/") as [string, string];
  return {
    id,
    workspace_id: "w1",
    owner,
    name,
    full_name: fullName,
    default_branch: "main",
    clone_path: null,
    last_polled_at: null,
    created_by: null,
  };
}

export const BUNDLE_FILES: CiFile[] = [
  { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: Security Reviewer\n", editable: false },
  { path: ".devdigest/memory.jsonl", contents: "", editable: false },
  { path: ".devdigest/runner/index.js", contents: "// runner", editable: false },
  { path: ".devdigest/runner/300.index.js", contents: "// chunk", editable: false },
  { path: ".devdigest/runner/package.json", contents: "{\"type\":\"module\"}", editable: false },
  { path: ".github/workflows/devdigest-review.yml", contents: "name: DevDigest\non: pull_request\n", editable: true },
];

export const exportResponse = (over: Record<string, unknown> = {}) => ({
  installation: null,
  files: BUNDLE_FILES,
  pr_url: null,
  pr_number: null,
  pr_reused: false,
  ...over,
});
