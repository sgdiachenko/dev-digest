import { describe, it, expect } from 'vitest';
import { resolveAgent, resolvePull, resolveRepo } from '../src/resolve.js';
import { ToolError } from '../src/errors.js';
import { makeAgent, makeMockApi, makePrMeta, makeRepo } from './fixtures.js';

describe('resolve', () => {
  it('resolveRepo matches full_name case-insensitively and names the next step when missing (D7)', async () => {
    const api = makeMockApi();
    api.listRepos.mockResolvedValue([makeRepo({ full_name: 'Acme/Widgets' })]);

    const repo = await resolveRepo(api, 'acme/WIDGETS');
    expect(repo.full_name).toBe('Acme/Widgets');

    await expect(resolveRepo(api, 'nobody/nothing')).rejects.toThrow(ToolError);
    await expect(resolveRepo(api, 'nobody/nothing')).rejects.toThrow(/not tracked/);
  });

  it('resolvePull matches by number within the given repo', async () => {
    const api = makeMockApi();
    const repo = makeRepo();
    api.listPullsForRepo.mockResolvedValue([makePrMeta({ number: 42, id: 'pr-42' })]);

    const pull = await resolvePull(api, repo, 42);
    expect(pull.id).toBe('pr-42');

    await expect(resolvePull(api, repo, 99)).rejects.toThrow(/PR #99/);
  });

  it('resolveAgent matches by id and reports the next step when missing', async () => {
    const api = makeMockApi();
    api.listAgents.mockResolvedValue([makeAgent({ id: 'agent-x' })]);

    const agent = await resolveAgent(api, 'agent-x');
    expect(agent.id).toBe('agent-x');

    await expect(resolveAgent(api, 'unknown')).rejects.toThrow(/list_agents/);
  });
});
