import { describe, it, expect } from 'vitest';
import { createListAgentsTool } from '../src/tools/list-agents.js';
import { createRunAgentOnPullRequestTool } from '../src/tools/run-agent-on-pull-request.js';
import { createGetFindingsTool } from '../src/tools/get-findings.js';
import { createGetConventionsTool } from '../src/tools/get-conventions.js';
import { createGetBlastRadiusTool } from '../src/tools/get-blast-radius.js';
import { RunCache } from '../src/run-cache.js';
import type { Config } from '../src/config.js';
import {
  makeAgent,
  makeBlastRadiusResponse,
  makeConventionCandidate,
  makeMockApi,
  makePrMeta,
  makeRepo,
  makeReviewRecord,
  makeReviewRunResponse,
  makeRunSummary,
} from './fixtures.js';

const testConfig: Config = { apiUrl: 'http://x', pollIntervalMs: 1, runTimeoutMs: 50 };

describe('list_agents', () => {
  it('returns only id/name/description/provider/model per agent', async () => {
    const api = makeMockApi();
    api.listAgents.mockResolvedValue([
      makeAgent({ id: 'a1', name: 'Sec', description: 'security reviewer', provider: 'anthropic', model: 'claude', enabled: false }),
    ]);
    const tool = createListAgentsTool({ api });

    const result = await tool.handler();

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      agents: [{ id: 'a1', name: 'Sec', description: 'security reviewer', provider: 'anthropic', model: 'claude' }],
    });
  });
});

describe('run_agent_on_pull_request', () => {
  it('resolves repo/pr/agent, triggers, caches run_id before polling, and returns the compact review', async () => {
    const api = makeMockApi();
    api.listRepos.mockResolvedValue([makeRepo({ full_name: 'acme/widgets', id: 'repo-1' })]);
    api.listPullsForRepo.mockResolvedValue([makePrMeta({ number: 42, id: 'pr-1' })]);
    api.listAgents.mockResolvedValue([makeAgent({ id: 'agent-1' })]);
    api.triggerReview.mockResolvedValue(makeReviewRunResponse({ runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'General' }] }));
    api.listRuns.mockResolvedValue([makeRunSummary({ run_id: 'run-1', status: 'done' })]);
    api.listReviews.mockResolvedValue([
      makeReviewRecord({ run_id: 'run-1', findings: [] }),
    ]);
    const cache = new RunCache();
    const tool = createRunAgentOnPullRequestTool({ api, cache, config: testConfig });

    const result = await tool.handler({ repo: 'ACME/Widgets', pr: 42, agent: 'agent-1' });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ run_id: 'run-1', verdict: 'request_changes' });
    // Cached before/regardless of poll outcome (D3) — resolvable by get_findings.
    expect(cache.get('run-1')).toBe('pr-1');
    expect(api.triggerReview).toHaveBeenCalledWith('pr-1', 'agent-1');
  });

  it('errors with an actionable message and next step when the repo is unknown', async () => {
    const api = makeMockApi();
    api.listRepos.mockResolvedValue([]);
    const tool = createRunAgentOnPullRequestTool({ api, cache: new RunCache(), config: testConfig });

    const result = await tool.handler({ repo: 'nobody/nothing', pr: 1, agent: 'a' });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/not tracked/);
  });

  it('errors naming the run_id and get_findings when the run does not finish in time', async () => {
    const api = makeMockApi();
    api.listRepos.mockResolvedValue([makeRepo({ full_name: 'acme/widgets', id: 'repo-1' })]);
    api.listPullsForRepo.mockResolvedValue([makePrMeta({ number: 42, id: 'pr-1' })]);
    api.listAgents.mockResolvedValue([makeAgent({ id: 'agent-1' })]);
    api.triggerReview.mockResolvedValue(makeReviewRunResponse());
    api.listRuns.mockResolvedValue([makeRunSummary({ run_id: 'run-1', status: 'running' })]);
    const cache = new RunCache();
    const tool = createRunAgentOnPullRequestTool({
      api,
      cache,
      config: { apiUrl: 'http://x', pollIntervalMs: 5, runTimeoutMs: 5 },
    });

    const result = await tool.handler({ repo: 'acme/widgets', pr: 42, agent: 'agent-1' });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/get_findings/);
    // The run_id is cached even though the tool call itself timed out (D3).
    expect(cache.get('run-1')).toBe('pr-1');
  });
});

describe('get_findings', () => {
  it('errors naming run_agent_on_pull_request when run_id is unknown', async () => {
    const api = makeMockApi();
    const tool = createGetFindingsTool({ api, cache: new RunCache() });

    const result = await tool.handler({ run_id: 'ghost' });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/run_agent_on_pull_request/);
  });

  it('errors naming a retry when the run is still running', async () => {
    const api = makeMockApi();
    api.listRuns.mockResolvedValue([makeRunSummary({ run_id: 'run-1', status: 'running' })]);
    const cache = new RunCache();
    cache.set('run-1', 'pr-1');
    const tool = createGetFindingsTool({ api, cache });

    const result = await tool.handler({ run_id: 'run-1' });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/still in progress/);
  });

  it('returns the compact review, excluding dismissed findings (D8), once done', async () => {
    const api = makeMockApi();
    api.listRuns.mockResolvedValue([makeRunSummary({ run_id: 'run-1', status: 'done' })]);
    api.listReviews.mockResolvedValue([
      makeReviewRecord({
        run_id: 'run-1',
        findings: [
          {
            id: 'kept',
            severity: 'CRITICAL',
            category: 'security',
            title: 'kept',
            file: 'a.ts',
            start_line: 1,
            end_line: 1,
            rationale: 'r',
            suggestion: null,
            confidence: 0.9,
            review_id: 'review-1',
            accepted_at: null,
            dismissed_at: null,
          },
          {
            id: 'dismissed',
            severity: 'WARNING',
            category: 'style',
            title: 'dismissed',
            file: 'b.ts',
            start_line: 2,
            end_line: 2,
            rationale: 'r',
            suggestion: null,
            confidence: 0.5,
            review_id: 'review-1',
            accepted_at: null,
            dismissed_at: new Date().toISOString(),
          },
        ],
      }),
    ]);
    const cache = new RunCache();
    cache.set('run-1', 'pr-1');
    const tool = createGetFindingsTool({ api, cache });

    const result = await tool.handler({ run_id: 'run-1' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { findings: Array<{ id: string }> };
    expect(structured.findings.map((f) => f.id)).toEqual(['kept']);
  });
});

describe('get_conventions', () => {
  it('returns only accepted conventions, compacted to rule/rationale/category (D5)', async () => {
    const api = makeMockApi();
    api.listRepos.mockResolvedValue([makeRepo({ full_name: 'acme/widgets', id: 'repo-1' })]);
    api.listConventions.mockResolvedValue([
      makeConventionCandidate({ rule: 'accepted rule', status: 'accepted' }),
      makeConventionCandidate({ rule: 'pending rule', status: 'pending' }),
      makeConventionCandidate({ rule: 'rejected rule', status: 'rejected' }),
    ]);
    const tool = createGetConventionsTool({ api });

    const result = await tool.handler({ repo: 'acme/widgets' });

    expect(result.structuredContent).toEqual({
      conventions: [{ rule: 'accepted rule', rationale: 'Consistency.', category: 'naming' }],
    });
  });
});

describe('get_blast_radius', () => {
  it('resolves repo/pr and returns the API blast-radius response as structuredContent', async () => {
    const api = makeMockApi();
    api.listRepos.mockResolvedValue([makeRepo({ full_name: 'acme/widgets', id: 'repo-1' })]);
    api.listPullsForRepo.mockResolvedValue([makePrMeta({ number: 42, id: 'pr-1' })]);
    api.getBlastRadius.mockResolvedValue(makeBlastRadiusResponse());
    const tool = createGetBlastRadiusTool({ api });

    const result = await tool.handler({ repo: 'ACME/Widgets', pr: 42 });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(makeBlastRadiusResponse());
    expect(api.getBlastRadius).toHaveBeenCalledWith('pr-1');
  });

  it('errors with an actionable message when the PR is unknown', async () => {
    const api = makeMockApi();
    api.listRepos.mockResolvedValue([makeRepo({ full_name: 'acme/widgets', id: 'repo-1' })]);
    api.listPullsForRepo.mockResolvedValue([]);
    const tool = createGetBlastRadiusTool({ api });

    const result = await tool.handler({ repo: 'acme/widgets', pr: 999 });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/not found/);
    expect(api.getBlastRadius).not.toHaveBeenCalled();
  });
});
