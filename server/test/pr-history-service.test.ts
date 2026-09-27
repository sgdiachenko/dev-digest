/**
 * `PrHistoryService`, unit-tested against fake `PrHistoryStore`/`PrHistoryRepos`/
 * `PrHistorySource` ports — no DB, no network (P3/E4-E7).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  PrHistoryService,
  type PrHistoryStore,
  type PrHistoryRepos,
  type PrHistorySource,
} from '../src/modules/pr-history/service.js';
import { NotFoundError } from '../src/platform/errors.js';

interface Fixture {
  pull?: { number: number; repoId: string } | undefined;
  /** `null` = repo lookup misses (404); omitted = a default repo row. */
  repo?: { owner: string; name: string } | null;
  files?: { path: string }[];
  commitsByPath?: Record<string, { sha: string }[]>;
  pullsByCommit?: Record<
    string,
    { number: number; title: string; merged_at: string | null; author: string }[]
  >;
}

function makePorts(fx: Fixture = {}): {
  repo: PrHistoryStore;
  repos: PrHistoryRepos;
  source: PrHistorySource & { listCommitsForPath: ReturnType<typeof vi.fn> };
} {
  const listCommitsForPath = vi.fn(
    async (_repo, path: string) => fx.commitsByPath?.[path] ?? [],
  );
  return {
    repo: {
      findPull: async () => fx.pull,
      listFiles: async () => fx.files ?? [],
    },
    repos: {
      findRepoById: async () => (fx.repo === null ? undefined : (fx.repo ?? { owner: 'acme', name: 'x' })),
    },
    source: {
      listCommitsForPath,
      listPullRequestsForCommit: async (_repo, sha: string) => fx.pullsByCommit?.[sha] ?? [],
    },
  };
}

describe('PrHistoryService.getHistory', () => {
  it('404s when the PR is not found', async () => {
    const { repo, repos, source } = makePorts({ pull: undefined });
    const service = new PrHistoryService(repo, repos, source);
    await expect(service.getHistory('ws-1', 'pr-missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when the PR references an unknown repo', async () => {
    const { repo, repos, source } = makePorts({
      pull: { number: 42, repoId: 'repo-1' },
      repo: null,
    });
    const service = new PrHistoryService(repo, repos, source);
    await expect(service.getHistory('ws-1', 'pr-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('dedups the same PR number found via two different files/commits, unioning files_overlap', async () => {
    const { repo, repos, source } = makePorts({
      pull: { number: 99, repoId: 'repo-1' },
      files: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }],
      commitsByPath: {
        'src/a.ts': [{ sha: 'c1' }],
        'src/b.ts': [{ sha: 'c2' }],
      },
      pullsByCommit: {
        c1: [{ number: 401, title: 'Refactor a', merged_at: '2026-06-01T00:00:00Z', author: 'marisa' }],
        c2: [{ number: 401, title: 'Refactor a', merged_at: '2026-06-01T00:00:00Z', author: 'marisa' }],
      },
    });
    const service = new PrHistoryService(repo, repos, source);
    const result = await service.getHistory('ws-1', 'pr-1');

    expect(result.history).toHaveLength(1);
    expect(result.history[0]!.pr_number).toBe(401);
    expect(result.history[0]!.files_overlap.sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('excludes the current PR and any PR that is not merged', async () => {
    const { repo, repos, source } = makePorts({
      pull: { number: 500, repoId: 'repo-1' },
      files: [{ path: 'src/a.ts' }],
      commitsByPath: { 'src/a.ts': [{ sha: 'c1' }] },
      pullsByCommit: {
        c1: [
          { number: 500, title: 'This very PR', merged_at: null, author: 'me' },
          { number: 300, title: 'Still open', merged_at: null, author: 'someone' },
          { number: 301, title: 'Merged before', merged_at: '2026-05-01T00:00:00Z', author: 'someone' },
        ],
      },
    });
    const service = new PrHistoryService(repo, repos, source);
    const result = await service.getHistory('ws-1', 'pr-1');

    expect(result.history.map((h) => h.pr_number)).toEqual([301]);
  });

  it('caps files read at MAX_FILES (5) and requests only MAX_COMMITS_PER_FILE (5) per file', async () => {
    const files = Array.from({ length: 8 }, (_, i) => ({ path: `src/file${i}.ts` }));
    const { repo, repos, source } = makePorts({
      pull: { number: 1, repoId: 'repo-1' },
      files,
    });
    const service = new PrHistoryService(repo, repos, source);
    await service.getHistory('ws-1', 'pr-1');

    expect(source.listCommitsForPath).toHaveBeenCalledTimes(5);
    for (const call of source.listCommitsForPath.mock.calls) {
      expect(call[2]).toBe(5);
    }
  });

  it('sorts merged PRs by merged_at descending and caps at MAX_RESULTS (10)', async () => {
    const pulls = Array.from({ length: 12 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      merged_at: new Date(2026, 0, i + 1).toISOString(),
      author: 'someone',
    }));
    const { repo, repos, source } = makePorts({
      pull: { number: 999, repoId: 'repo-1' },
      files: [{ path: 'src/a.ts' }],
      commitsByPath: { 'src/a.ts': [{ sha: 'c1' }] },
      pullsByCommit: { c1: pulls },
    });
    const service = new PrHistoryService(repo, repos, source);
    const result = await service.getHistory('ws-1', 'pr-1');

    expect(result.history).toHaveLength(10);
    expect(result.history[0]!.pr_number).toBe(12);
    expect(result.history[9]!.pr_number).toBe(3);
  });

  it('passes the resolved repo owner/name as RepoRef to the GitHub port', async () => {
    const { repo, repos, source } = makePorts({
      pull: { number: 1, repoId: 'repo-1' },
      repo: { owner: 'acme', name: 'widgets' },
      files: [{ path: 'src/a.ts' }],
    });
    const service = new PrHistoryService(repo, repos, source);
    await service.getHistory('ws-1', 'pr-1');

    expect(source.listCommitsForPath).toHaveBeenCalledWith(
      { owner: 'acme', name: 'widgets' },
      'src/a.ts',
      5,
    );
  });
});
