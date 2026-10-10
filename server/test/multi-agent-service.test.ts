import { describe, it, expect, vi } from 'vitest';
import { ReviewService } from '../src/modules/reviews/service.js';
import type { AgentsReader } from '../src/modules/reviews/service.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import type { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import type { AgentRow } from '../src/db/rows.js';
import { RunBus } from '../src/platform/sse.js';
import { AppError } from '../src/platform/errors.js';

/** Group validation + start + read in the service, with fakes for every port (no DB). */

/** Valid uuid from one hex char, so ids pass the service's format check. */
const U = (c: string) => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${c.repeat(12)}`;
const [A, B, C, D, E, F] = ['a', 'b', 'c', 'd', 'e', 'f'].map(U) as [string, string, string, string, string, string];

const agent = (id: string, enabled = true): AgentRow =>
  ({ id, name: `Agent ${id}`, provider: 'openai', model: 'm', enabled }) as unknown as AgentRow;

function setup(opts: { agents?: AgentRow[]; create?: unknown; pull?: unknown; group?: unknown } = {}) {
  const store = new Map((opts.agents ?? [A, B, C, D, E].map((i) => agent(i))).map((a) => [a.id, a]));
  const listEnabled = vi.fn(async () => [...store.values()].filter((a) => a.enabled));
  const getById = vi.fn(async (_ws: string, id: string) => store.get(id));
  const agents: AgentsReader = { listEnabled, getById };
  const createGroupWithRuns = vi.fn(async (v: { agents: { agentId: string }[] }) =>
    opts.create ?? { kind: 'created', groupId: 'g1', runs: v.agents.map((a, i) => ({ id: `run-${i}`, agentId: a.agentId })) },
  );
  const repo = {
    getPull: vi.fn(async (_ws: string, id: string) => ('pull' in opts ? opts.pull : id === 'pr-foreign' ? undefined : { id, repoId: 'repo-1', number: 3 })),
    getRepo: async () => ({ owner: 'o', name: 'n' }),
    createGroupWithRuns,
    latestGroupForPull: async () => opts.group,
    groupMembers: async () => [],
    reviewsForRuns: async () => [],
  } as unknown as ReviewRepository;
  const executeRuns = vi.fn(async () => undefined);
  const service = new ReviewService(repo, agents, new RunBus(), { executeRuns } as unknown as ReviewRunExecutor);
  return { service, createGroupWithRuns, executeRuns, listEnabled, getById };
}

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected rejection');
};

describe('resolveGroupTargets', () => {
  it('dedupes ids: duplicates give one run per distinct id (AC-2)', async () => {
    const { service } = setup();
    const out = await service.resolveGroupTargets('ws', { agent_ids: [A, B, A, C, B] });
    expect(out.map((a) => a.id)).toEqual([A, B, C]);
  });

  it('accepts 5 enabled agents (NFR-4)', async () => {
    const { service } = setup();
    expect(await service.resolveGroupTargets('ws', { agent_ids: [A, B, C, D, E] })).toHaveLength(5);
  });

  it('unknown and foreign ids give the same 422 "agent not found" (AC-3)', async () => {
    const { service } = setup();
    const unknown = await fail(service.resolveGroupTargets('ws', { agent_ids: [A, F] }));
    const foreign = await fail(service.resolveGroupTargets('ws', { agent_ids: [A, U('9')] }));
    expect(unknown.statusCode).toBe(422);
    expect(unknown.message).toBe('agent not found');
    expect(foreign.message).toBe(unknown.message);
  });

  it('a disabled id gives 422 "agent is disabled" (AC-50) but "not found" wins (EC-16)', async () => {
    const { service } = setup({ agents: [agent(A), agent(B, false), agent(C)] });
    const disabled = await fail(service.resolveGroupTargets('ws', { agent_ids: [A, B] }));
    expect(disabled).toMatchObject({ statusCode: 422, message: 'agent is disabled' });
    const both = await fail(service.resolveGroupTargets('ws', { agent_ids: [B, F] }));
    expect(both.message).toBe('agent not found');
  });

  it('a non-uuid id gives 422 "agent not found" with no lookup (AC-3)', async () => {
    const { service, listEnabled, getById } = setup();
    const err = await fail(service.resolveGroupTargets('ws', { agent_ids: [A, 'not-a-uuid'] }));
    expect(err).toMatchObject({ statusCode: 422, message: 'agent not found' });
    expect(listEnabled).not.toHaveBeenCalled();
    expect(getById).not.toHaveBeenCalled();
  });

  it('more distinct ids than enabled agents gives 422 "too many agents" (NFR-4)', async () => {
    const { service } = setup({ agents: [agent(A), agent(B), agent(C)] });
    const err = await fail(service.resolveGroupTargets('ws', { agent_ids: [A, B, C, D] }));
    expect(err).toMatchObject({ statusCode: 422, message: 'too many agents' });
  });

  it('resolves N ids with ONE workspace lookup, no per-id getById', async () => {
    const { service, listEnabled, getById } = setup();
    await service.resolveGroupTargets('ws', { agent_ids: [A, B, C, D, E] });
    expect(listEnabled).toHaveBeenCalledTimes(1);
    expect(getById).not.toHaveBeenCalled();
  });

  it('fewer than 2 distinct ids, or agent_ids with agentId/all, give 422 (AC-4)', async () => {
    const { service, createGroupWithRuns } = setup();
    for (const body of [
      { agent_ids: [A] },
      { agent_ids: [A, A] },
      { agent_ids: [] },
      { agent_ids: [A, B], agentId: A },
      { agent_ids: [A, B], all: true },
    ]) {
      expect((await fail(service.resolveGroupTargets('ws', body))).statusCode).toBe(422);
    }
    expect(createGroupWithRuns).not.toHaveBeenCalled();
  });
});

describe('runGroupReview', () => {
  const two = [agent(A), agent(B)];

  it('creates the group, starts the parallel executor and returns the group id (AC-1)', async () => {
    const { service, createGroupWithRuns, executeRuns } = setup();
    const out = await service.runGroupReview('ws', 'pr-1', two);
    expect(createGroupWithRuns).toHaveBeenCalledWith({
      workspaceId: 'ws',
      prId: 'pr-1',
      agents: [
        { agentId: A, provider: 'openai', model: 'm' },
        { agentId: B, provider: 'openai', model: 'm' },
      ],
    });
    expect(out.multi_agent_run_id).toBe('g1');
    expect(out.runs.map((r) => r.run_id)).toEqual(['run-0', 'run-1']);
    expect(out.reviews).toEqual([]);
    const call = executeRuns.mock.calls[0] as unknown as unknown[];
    expect(call[5]).toEqual({ parallel: true, groupId: 'g1' });
  });

  it('pairs each job with its own run by agent id when RETURNING order is shuffled', async () => {
    const { service, executeRuns } = setup({
      create: {
        kind: 'created',
        groupId: 'g1',
        runs: [
          { id: 'run-b', agentId: B },
          { id: 'run-a', agentId: A },
        ],
      },
    });
    const out = await service.runGroupReview('ws', 'pr-1', two);
    expect(out.runs).toEqual([
      { run_id: 'run-a', agent_id: A, agent_name: `Agent ${A}` },
      { run_id: 'run-b', agent_id: B, agent_name: `Agent ${B}` },
    ]);
    const jobs = (executeRuns.mock.calls[0] as unknown as unknown[])[3] as { agent: AgentRow; runId: string }[];
    expect(jobs.map((j) => [j.agent.id, j.runId])).toEqual([
      [A, 'run-a'],
      [B, 'run-b'],
    ]);
  });

  it('a missing PR gives 404 and creates nothing (AC-5)', async () => {
    const { service, createGroupWithRuns } = setup();
    expect((await fail(service.runGroupReview('ws', 'pr-foreign', two))).statusCode).toBe(404);
    expect(createGroupWithRuns).not.toHaveBeenCalled();
  });

  it('a running group gives 409 with details.multi_agent_run_id and starts nothing (AC-6)', async () => {
    const { service, executeRuns } = setup({ create: { kind: 'conflict', groupId: 'g-active' } });
    const err = await fail(service.runGroupReview('ws', 'pr-1', two));
    expect(err.statusCode).toBe(409);
    expect(err.details).toEqual({ multi_agent_run_id: 'g-active' });
    expect(executeRuns).not.toHaveBeenCalled();
  });
});

describe('multiAgentForPull / agentRunEstimates', () => {
  it('a foreign PR gives 404; a PR with no group gives null (AC-14, AC-51)', async () => {
    const { service } = setup();
    expect((await fail(service.multiAgentForPull('ws', 'pr-foreign'))).statusCode).toBe(404);
    expect(await service.multiAgentForPull('ws', 'pr-1')).toBeNull();
  });

  it('builds the latest group when one exists', async () => {
    const { service } = setup({ group: { id: 'g1', prId: 'pr-1', ranAt: new Date('2026-10-09T00:00:00Z') } });
    expect(await service.multiAgentForPull('ws', 'pr-1')).toMatchObject({ id: 'g1', pr_number: 3, columns: [] });
  });

  it('uses no body field other than agent_ids to pick targets (NFR-7)', async () => {
    const { service } = setup();
    const out = await service.resolveGroupTargets('ws', { agent_ids: [A, B], ...({ extra: 'x' } as object) });
    expect(out.map((a) => a.id)).toEqual([A, B]);
  });
});
