import type { AgentPerf, AgentPerfRow } from "@devdigest/shared";

/** Test fixtures for the Agent Performance screen (figures taken from the seeded demo shape). */
export function perfRow(over: Partial<AgentPerfRow> = {}): AgentPerfRow {
  return {
    agent_id: "a1",
    agent_name: "Security Reviewer",
    enabled: true,
    runs: 13,
    failed: 0,
    cancelled: 0,
    total_cost_usd: 0.5,
    avg_cost_usd: 0.0381818,
    unknown_cost_runs: 0,
    avg_duration_ms: 6200,
    accepted: 39,
    dismissed: 11,
    pending: 3,
    accept_rate: 0.78,
    small_sample: false,
    previous_accept_rate: 0.75,
    previous_small_sample: false,
    last_run_at: "2026-10-15T11:56:00.000Z",
    last_runs: [],
    ...over,
  };
}

export function perfOf(over: Partial<AgentPerf> = {}, summary: Partial<AgentPerf["summary"]> = {}): AgentPerf {
  return {
    period: {
      from: "2026-09-15T12:00:00.000Z",
      to: "2026-10-15T12:00:00.000Z",
      previous_from: "2026-08-16T12:00:00.000Z",
      previous_to: "2026-09-15T12:00:00.000Z",
    },
    as_of: "2026-10-15T12:00:00.000Z",
    summary: {
      runs: 22,
      failed: 1,
      cancelled: 1,
      in_progress: 0,
      total_cost_usd: 0.48,
      unknown_cost_runs: 0,
      previous_total_cost_usd: null,
      accepted: 16,
      dismissed: 6,
      pending: 4,
      avg_accept_rate: 16 / 22,
      small_sample: false,
      most_active: { agent_id: "a1", agent_name: "Security Reviewer", runs: 13, accept_rate: 0.76 },
      agent_count: 2,
      workspace_last_run_at: "2026-10-15T11:56:00.000Z",
      ...summary,
    },
    agents: [perfRow()],
    cost_by_agent: [{ agent_id: "a1", agent_name: "Security Reviewer", cost_usd: 0.48 }],
    cost_by_model: [{ model: "gpt-4.1", cost_usd: 0.48 }],
    runs_trend: [0, 3, 1].map((runs, i) => ({ bucket_start: `2026-10-0${i + 1}T00:00:00.000Z`, runs })),
    ...over,
  };
}
