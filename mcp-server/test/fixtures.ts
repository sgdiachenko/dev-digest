import { vi } from 'vitest';
import type {
  Agent,
  ConventionCandidate,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
} from '../src/vendor/shared/index.js';
import type { DevDigestApi } from '../src/api/client.js';

// Not a `*.test.ts` file — vitest's `include` glob only picks up test files,
// so these builders/mocks are shared without being collected as a suite.

export function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'General',
    description: 'General-purpose reviewer',
    provider: 'openai',
    model: 'gpt-4.1',
    system_prompt: 'Review this PR.',
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    ...overrides,
  };
}

export function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    workspace_id: 'ws-1',
    owner: 'acme',
    name: 'widgets',
    full_name: 'acme/widgets',
    default_branch: 'main',
    clone_path: '/clones/acme/widgets',
    last_polled_at: null,
    created_by: null,
    ...overrides,
  };
}

export function makePrMeta(overrides: Partial<PrMeta> = {}): PrMeta {
  return {
    id: 'pr-1',
    number: 42,
    title: 'Add feature',
    author: 'octocat',
    branch: 'feature/x',
    base: 'main',
    head_sha: 'abc123',
    additions: 10,
    deletions: 2,
    files_count: 3,
    status: 'needs_review',
    ...overrides,
  };
}

export function makeReviewRecord(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'review-1',
    pr_id: 'pr-1',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'General',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'Looks mostly fine, one issue.',
    score: 62,
    model: 'gpt-4.1',
    grounding: 'ok',
    created_at: new Date().toISOString(),
    findings: [
      {
        id: 'finding-1',
        severity: 'WARNING',
        category: 'bug',
        title: 'Off-by-one',
        file: 'src/x.ts',
        start_line: 10,
        end_line: 12,
        rationale: 'Loop bound is wrong.',
        suggestion: 'Use `<` instead of `<=`.',
        confidence: 0.8,
        review_id: 'review-1',
        accepted_at: null,
        dismissed_at: null,
      },
    ],
    cost_usd: 0.01,
    ...overrides,
  };
}

export function makeRunSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'General',
    provider: 'openai',
    model: 'gpt-4.1',
    status: 'done',
    error: null,
    duration_ms: 1200,
    tokens_in: 1000,
    tokens_out: 200,
    cost_usd: 0.01,
    findings_count: 1,
    grounding: 'ok',
    ran_at: new Date().toISOString(),
    score: 62,
    blockers: 0,
    ...overrides,
  };
}

export function makeConventionCandidate(
  overrides: Partial<ConventionCandidate> = {},
): ConventionCandidate {
  return {
    id: 'conv-1',
    repo_id: 'repo-1',
    category: 'naming',
    rule: 'Use camelCase for variables.',
    rationale: 'Consistency.',
    evidence_path: 'src/x.ts',
    evidence_line: 3,
    evidence_snippet: 'const fooBar = 1;',
    confidence: 0.9,
    status: 'accepted',
    origin: 'model',
    support_count: 5,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeReviewRunResponse(
  overrides: Partial<ReviewRunResponse> = {},
): ReviewRunResponse {
  return {
    pr_id: 'pr-1',
    runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'General' }],
    reviews: [],
    ...overrides,
  };
}

/** A fully-stubbed `DevDigestApi` — every method is a `vi.fn()` the test configures. */
export function makeMockApi(): DevDigestApi & Record<keyof DevDigestApi, ReturnType<typeof vi.fn>> {
  return {
    listAgents: vi.fn().mockResolvedValue([makeAgent()]),
    listRepos: vi.fn().mockResolvedValue([makeRepo()]),
    listPullsForRepo: vi.fn().mockResolvedValue([makePrMeta()]),
    triggerReview: vi.fn().mockResolvedValue(makeReviewRunResponse()),
    listRuns: vi.fn().mockResolvedValue([makeRunSummary()]),
    listReviews: vi.fn().mockResolvedValue([makeReviewRecord()]),
    listConventions: vi.fn().mockResolvedValue([makeConventionCandidate()]),
  };
}
