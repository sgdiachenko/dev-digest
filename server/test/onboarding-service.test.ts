import { describe, it, expect, vi } from 'vitest';
import type { GitTreeEntry } from '@devdigest/shared';
import { OnboardingService } from '../src/modules/onboarding/service.js';
import { TOUR_CACHE_MAX } from '../src/modules/onboarding/constants.js';
import type { TourOverlay, TourRepo, TourRepoStore } from '../src/modules/onboarding/types.js';
import type { GraphFacts, IndexState } from '../src/modules/repo-intel/types.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { NotFoundError } from '../src/platform/errors.js';

const SHA = 'a'.repeat(40);
const oid = (c: string) => c.repeat(40);
const blob = (path: string, o: string, size: number): GitTreeEntry => ({
  path,
  mode: '100644',
  type: 'blob',
  oid: o,
  size,
});

const REPO: TourRepo = { id: 'r1', workspaceId: 'w1', owner: 'acme', name: 'app', clonePath: '/clone' };

class FakeStore implements TourRepoStore {
  constructor(public repos: TourRepo[] = [REPO]) {}
  async getRepo(ws: string, id: string) {
    return this.repos.find((r) => r.workspaceId === ws && r.id === id) ?? null;
  }
}

const indexState = (over: Partial<IndexState> = {}): IndexState => ({
  repoId: 'r1',
  status: 'full',
  filesIndexed: 3,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: SHA,
  indexerVersion: 1,
  updatedAt: new Date(1_000),
  ...over,
});

const EMPTY_GRAPH: GraphFacts = { edges: [], ranks: [], fileFacts: [] };

function setup(
  opts: {
    state?: IndexState | (() => IndexState);
    tree?: GitTreeEntry[];
    blobs?: Record<string, string>;
    listTreeError?: Error;
    readBlobError?: Error;
    store?: FakeStore;
    overlay?: TourOverlay;
    graph?: GraphFacts;
  } = {},
) {
  const git = new MockGitClient({
    tree: opts.tree ?? [
      blob('package.json', oid('1'), 40),
      blob('src/index.ts', oid('2'), 10),
      blob('README.md', oid('3'), 8),
    ],
    blobs: opts.blobs ?? { [oid('1')]: '{"name":"app","scripts":{"test":"vitest"}}', [oid('3')]: '# app' },
    ...(opts.listTreeError ? { listTreeError: opts.listTreeError } : {}),
    ...(opts.readBlobError ? { readBlobError: opts.readBlobError } : {}),
  });
  const listTree = vi.spyOn(git, 'listTree');
  const getIndexState = vi.fn(async () => {
    const s = opts.state ?? indexState();
    return typeof s === 'function' ? s() : s;
  });
  const getGraphFacts = vi.fn(async () => opts.graph ?? EMPTY_GRAPH);
  const service = new OnboardingService(
    opts.store ?? new FakeStore(),
    { getIndexState, getGraphFacts },
    git,
    opts.overlay,
    () => new Date('2026-10-01T00:00:00.000Z'),
  );
  return { service, git, listTree, getIndexState, getGraphFacts };
}

describe('OnboardingService.getFacts', () => {
  it('404s for an unknown repo or another workspace', async () => {
    const { service } = setup();
    await expect(service.getFacts('w1', 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getFacts('w2', 'r1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reports not_cloned without touching the index or git', async () => {
    const store = new FakeStore([{ ...REPO, clonePath: null }]);
    const { service, getIndexState, listTree } = setup({ store });
    const facts = await service.getFacts('w1', 'r1');
    expect(facts).toMatchObject({ availability: 'not_cloned', source_sha: null, sections: null });
    expect(getIndexState).not.toHaveBeenCalled();
    expect(listTree).not.toHaveBeenCalled();
  });

  it('reports not_indexed when the repo was never indexed', async () => {
    const { service, listTree } = setup({ state: indexState({ lastIndexedSha: '', status: 'failed' }) });
    const facts = await service.getFacts('w1', 'r1');
    expect(facts).toMatchObject({ availability: 'not_indexed', sections: null, source_sha: null });
    expect(facts.index.status).toBe('failed');
    expect(listTree).not.toHaveBeenCalled();
  });

  it('reports not_indexed (and caches nothing) when the tree cannot be listed', async () => {
    const { service, listTree } = setup({ listTreeError: new Error('bad object') });
    expect((await service.getFacts('w1', 'r1')).availability).toBe('not_indexed');
    await service.getFacts('w1', 'r1');
    expect(listTree).toHaveBeenCalledTimes(2);
  });

  it('builds sections from the tree at the indexed sha and exposes a blob/tree index', async () => {
    const { service, git } = setup();
    const facts = await service.getFacts('w1', 'r1');
    expect(facts.availability).toBe('available');
    expect(facts.source_sha).toBe(SHA);
    expect(facts.sections).not.toBeNull();
    expect(facts.index.files_in_repo).toBe(3);
    expect(facts.treeIndex.get('src/index.ts')).toEqual({ oid: oid('2'), size: 10, kind: 'blob' });
    // src/index.ts is not a manifest/readme: never read.
    expect(git.readBlobCalls).not.toContain(oid('2'));
    // grep ran for the three signals, at the indexed sha
    expect(git.grepCalls.map((c) => c.patterns[0]).sort()).toEqual(['@SpringBootApplication', 'TODO', '^package main']);
    expect(git.grepCalls.every((c) => c.sha === SHA)).toBe(true);
  });

  it('ignores non-blob tree entries when counting files', async () => {
    const tree: GitTreeEntry[] = [
      blob('README.md', oid('3'), 8),
      { path: 'vendor/sub', mode: '160000', type: 'commit', oid: oid('9'), size: null },
    ];
    const { service } = setup({ tree });
    const facts = await service.getFacts('w1', 'r1');
    expect(facts.index.files_in_repo).toBe(1);
    expect(facts.treeIndex.get('vendor/sub')?.kind).toBe('commit');
  });

  it('counts a failing blob read as skipped instead of failing', async () => {
    const { service } = setup({ readBlobError: new Error('boom') });
    const facts = await service.getFacts('w1', 'r1');
    expect(facts.availability).toBe('available');
    expect(facts.index.files_skipped_by_tour).toBeGreaterThan(0);
  });

  it('serves the second call from cache and shares one in-flight computation', async () => {
    const { service, listTree } = setup();
    const [a, b] = await Promise.all([service.getFacts('w1', 'r1'), service.getFacts('w1', 'r1')]);
    expect(b).toBe(a);
    expect(await service.getFacts('w1', 'r1')).toBe(a);
    expect(listTree).toHaveBeenCalledTimes(1);
  });

  it('recomputes when the index is rebuilt at the same sha', async () => {
    let version = 1_000;
    const { service, listTree } = setup({ state: () => indexState({ updatedAt: new Date(version) }) });
    await service.getFacts('w1', 'r1');
    version = 2_000;
    await service.getFacts('w1', 'r1');
    expect(listTree).toHaveBeenCalledTimes(2);
  });

  it('keeps at most TOUR_CACHE_MAX fact sets, evicting the least recently used', async () => {
    const repos = Array.from({ length: TOUR_CACHE_MAX + 1 }, (_, i) => ({ ...REPO, id: `r${i}` }));
    const { service, listTree } = setup({ store: new FakeStore(repos) });
    for (const r of repos) await service.getFacts('w1', r.id);
    expect(listTree).toHaveBeenCalledTimes(TOUR_CACHE_MAX + 1);
    await service.getFacts('w1', 'r1'); // still cached
    expect(listTree).toHaveBeenCalledTimes(TOUR_CACHE_MAX + 1);
    await service.getFacts('w1', 'r0'); // evicted
    expect(listTree).toHaveBeenCalledTimes(TOUR_CACHE_MAX + 2);
  });

  it('logs metadata only', async () => {
    const info = vi.fn();
    const { service } = setup();
    await service.getFacts('w1', 'r1', { info, warn: vi.fn() });
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain('"sha"');
    expect(logged).not.toContain('vitest');
    expect(logged).not.toContain('# app');
  });

  it('logs per-section counts and the degradation reason, never contents', async () => {
    const info = vi.fn();
    const { service } = setup({ state: indexState({ status: 'degraded', reason: 'parser_unavailable' }) });
    const facts = await service.getFacts('w1', 'r1', { info, warn: vi.fn() });
    const meta = info.mock.calls[0]![0] as Record<string, unknown>;
    const s = facts.sections!;
    expect(meta.sectionCounts).toEqual({
      modules: s.architecture.modules.length,
      critical_paths: s.critical_paths.items.length,
      run_locally_commands: s.run_locally.groups.reduce((n, g) => n + g.commands.length, 0),
      reading_path: s.reading_path.items.length,
      first_tasks: s.first_tasks.items.length,
    });
    expect(meta.degradationReason).toBe('parser_unavailable');
    expect(meta.indexStatus).toBe('degraded');
    expect(JSON.stringify(meta)).not.toContain('vitest');
  });

  it('logs a null degradation reason for a full index', async () => {
    const info = vi.fn();
    const { service } = setup();
    await service.getFacts('w1', 'r1', { info, warn: vi.fn() });
    expect((info.mock.calls[0]![0] as Record<string, unknown>).degradationReason).toBeNull();
  });
});

describe('OnboardingService.getTour', () => {
  it('asks the overlay on every request with the facts sha, without caching its answer', async () => {
    let n = 0;
    const forTour = vi.fn(async () => ({ narrative: null, estimated_cost: { usd: ++n } as never }));
    const { service, listTree } = setup({ overlay: { forTour } });
    const first = await service.getTour('w1', 'r1');
    const second = await service.getTour('w1', 'r1');
    expect(forTour).toHaveBeenCalledTimes(2);
    expect(forTour).toHaveBeenNthCalledWith(1, 'w1', 'r1', SHA);
    expect(first.estimated_cost).not.toEqual(second.estimated_cost);
    expect(listTree).toHaveBeenCalledTimes(1);
  });

  it('passes a null sha for an unavailable tour and maps to the wire shape', async () => {
    const forTour = vi.fn(async () => ({ narrative: null, estimated_cost: null }));
    const store = new FakeStore([{ ...REPO, clonePath: null }]);
    const { service } = setup({ store, overlay: { forTour } });
    const tour = await service.getTour('w1', 'r1');
    expect(forTour).toHaveBeenCalledWith('w1', 'r1', null);
    expect(tour).toMatchObject({
      repo_id: 'r1',
      availability: 'not_cloned',
      source_sha: null,
      sections: null,
      narrative: null,
      estimated_cost: null,
      computed_at: '2026-10-01T00:00:00.000Z',
    });
  });

  it('defaults to no narrative', async () => {
    const { service } = setup();
    const tour = await service.getTour('w1', 'r1');
    expect(tour.narrative).toBeNull();
    expect(tour.estimated_cost).toBeNull();
    expect(tour.sections).not.toBeNull();
  });
});
