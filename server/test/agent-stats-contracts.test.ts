import { describe, it, expect } from 'vitest';
import {
  AgentPerf,
  AgentPerfRow,
  AgentRunEstimate,
  AgentRunHistoryItem,
  AgentRunHistoryPage,
  AgentStats,
  CiRun,
  MultiAgentRun,
  RunSummary,
} from '../src/vendor/shared/index.js';

const period = {
  from: '2026-09-15T00:00:00.000Z',
  to: '2026-10-15T00:00:00.000Z',
  previous_from: '2026-08-16T00:00:00.000Z',
  previous_to: '2026-09-15T00:00:00.000Z',
};

const lastRun = (n: number) => ({
  run_id: `run-${n}`,
  ran_at: '2026-10-01T10:00:00.000Z',
  duration_ms: 6200,
  cost_usd: null,
});

const row = (over: Record<string, unknown> = {}) => ({
  agent_id: 'a1',
  agent_name: 'Security',
  enabled: true,
  runs: 12,
  failed: 1,
  cancelled: 0,
  total_cost_usd: 0.5,
  avg_cost_usd: 0.04,
  unknown_cost_runs: 2,
  avg_duration_ms: 6200,
  accepted: 8,
  dismissed: 2,
  pending: 1,
  accept_rate: 0.8,
  small_sample: false,
  previous_accept_rate: null,
  previous_small_sample: true,
  last_run_at: '2026-10-01T10:00:00.000Z',
  last_runs: [lastRun(1)],
  ...over,
});

const stats = (over: Record<string, unknown> = {}) => ({
  ...row(),
  period,
  as_of: '2026-10-15T00:00:00.000Z',
  previous_avg_cost_usd: null,
  runs_trend: [{ bucket_start: '2026-10-01T00:00:00.000Z', runs: 3 }],
  findings_by_severity: [
    { bucket_start: '2026-10-01T00:00:00.000Z', CRITICAL: 1, WARNING: 2, SUGGESTION: 3 },
  ],
  findings_by_category: [{ category: 'bug', count: 4 }],
  skills_usage: {
    runs_with_skill_data: 5,
    runs_without_skill_data: 7,
    skills: [{ skill_id: 's1', skill_name: null, runs: 5 }],
  },
  ...over,
});

const historyItem = (over: Record<string, unknown> = {}) => ({
  run_id: 'r1',
  ran_at: '2026-10-01T10:00:00.000Z',
  status: 'done',
  repo_id: null,
  repo_full_name: null,
  pr_number: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  findings_count: null,
  ...over,
});

describe('agent stats contracts', () => {
  it('AC-39: AgentPerf, AgentStats and AgentRunHistoryPage parse samples carrying period + as_of', () => {
    const perf = {
      period,
      as_of: '2026-10-15T00:00:00.000Z',
      summary: {
        runs: 12,
        failed: 1,
        cancelled: 0,
        in_progress: 0,
        total_cost_usd: 0.5,
        unknown_cost_runs: 2,
        previous_total_cost_usd: null,
        accepted: 8,
        dismissed: 2,
        pending: 1,
        avg_accept_rate: 0.8,
        small_sample: false,
        most_active: { agent_id: 'a1', agent_name: 'Security', runs: 12, accept_rate: 0.8 },
        agent_count: 3,
        workspace_last_run_at: null,
      },
      agents: [row()],
      cost_by_agent: [{ agent_id: null, agent_name: null, cost_usd: 0.1 }],
      cost_by_model: [{ model: null, cost_usd: 0.1 }],
      runs_trend: [{ bucket_start: '2026-10-01T00:00:00.000Z', runs: 3 }],
    };
    expect(AgentPerf.safeParse(perf).success).toBe(true);
    expect(AgentPerf.safeParse({ ...perf, period: undefined }).success).toBe(false);
    expect(AgentPerf.safeParse({ ...perf, as_of: undefined }).success).toBe(false);

    expect(AgentStats.safeParse(stats()).success).toBe(true);
    expect(AgentStats.safeParse(stats({ as_of: undefined })).success).toBe(false);

    const page = { items: [historyItem()], page: 1, page_size: 20, total: 1 };
    expect(AgentRunHistoryPage.safeParse(page).success).toBe(true);
    expect(AgentRunHistoryPage.safeParse({ ...page, page: 0 }).success).toBe(false);
  });

  it('AC-24: last_runs of 6 is rejected, 5 is accepted', () => {
    const five = Array.from({ length: 5 }, (_, i) => lastRun(i));
    expect(AgentPerfRow.safeParse(row({ last_runs: five })).success).toBe(true);
    expect(AgentPerfRow.safeParse(row({ last_runs: [...five, lastRun(5)] })).success).toBe(false);
  });

  it('AC-22: AgentPerfRow accepts a null agent_id, AgentStats rejects one', () => {
    const deleted = { agent_id: null, agent_name: null, enabled: null };
    expect(AgentPerfRow.safeParse(row(deleted)).success).toBe(true);
    expect(AgentStats.safeParse(stats({ agent_id: null })).success).toBe(false);
    expect(AgentStats.safeParse(stats({ agent_name: null })).success).toBe(false);
  });

  it('AC-33: page_size 21 and status running are rejected', () => {
    const page = { items: [], page: 1, page_size: 20, total: 0 };
    expect(AgentRunHistoryPage.safeParse({ ...page, page_size: 21 }).success).toBe(false);
    expect(AgentRunHistoryItem.safeParse(historyItem({ status: 'running' })).success).toBe(false);
    expect(AgentRunHistoryItem.safeParse(historyItem({ status: 'cancelled' })).success).toBe(true);
  });

  it('NFR-19: unrelated contracts keep their current keys', () => {
    expect(Object.keys(AgentRunEstimate.shape)).toEqual([
      'agent_id', 'runs', 'avg_duration_ms', 'avg_cost_usd',
    ]);
    expect(Object.keys(RunSummary.shape)).toEqual([
      'run_id', 'agent_id', 'agent_name', 'provider', 'model', 'status', 'error',
      'duration_ms', 'tokens_in', 'tokens_out', 'cost_usd', 'findings_count',
      'grounding', 'ran_at', 'score', 'blockers',
    ]);
    expect(Object.keys(MultiAgentRun.shape)).toEqual([
      'id', 'pr_id', 'pr_number', 'ran_at', 'agent_count', 'total_duration_ms',
      'total_cost_usd', 'columns', 'finding_groups', 'conflicts',
    ]);
    expect(Object.keys(CiRun.shape)).toEqual([
      'id', 'ci_installation_id', 'repo', 'pr_number', 'head_sha', 'workflow_run_id',
      'run_attempt', 'ran_at', 'duration_s', 'status', 'verdict', 'findings_count',
      'critical', 'warning', 'suggestion', 'cost_usd', 'agent', 'agent_version',
      'github_url', 'source', 'unavailable_reason', 'model', 'ci_fail_on', 'skills',
      'memory_sha256', 'manifest_sha256', 'runner_build', 'differs_from_export',
    ]);
  });
});
