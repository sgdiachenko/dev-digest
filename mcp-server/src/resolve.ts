import type { Agent, PrMeta, Repo } from './vendor/shared/index.js';
import type { DevDigestApi } from './api/client.js';
import { ToolError, agentNotFoundError, pullNotFoundError, repoNotFoundError } from './errors.js';

/**
 * `repo` ("owner/name") → the tracked `Repo`, case-insensitively — GitHub repo
 * names are case-insensitive (D7).
 */
export async function resolveRepo(api: DevDigestApi, repo: string): Promise<Repo> {
  const repos = await api.listRepos();
  const match = repos.find((r) => r.full_name.toLowerCase() === repo.toLowerCase());
  if (!match) throw new ToolError(repoNotFoundError(repo));
  return match;
}

/** PR `number` (as shown on GitHub) → the tracked `PrMeta`, scoped to one repo. */
export async function resolvePull(api: DevDigestApi, repo: Repo, pr: number): Promise<PrMeta> {
  const pulls = await api.listPullsForRepo(repo.id);
  const match = pulls.find((p) => p.number === pr);
  if (!match || !match.id) throw new ToolError(pullNotFoundError(repo.full_name, pr));
  return match;
}

/** `agent` id → the configured `Agent`. */
export async function resolveAgent(api: DevDigestApi, agent: string): Promise<Agent> {
  const agents = await api.listAgents();
  const match = agents.find((a) => a.id === agent);
  if (!match) throw new ToolError(agentNotFoundError(agent));
  return match;
}
