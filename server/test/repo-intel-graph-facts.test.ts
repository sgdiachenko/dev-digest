import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';

/**
 * `getGraphFacts` maps the three repository reads to domain shapes and sorts
 * them by path (code-unit order) so the onboarding tour is deterministic.
 * No Postgres: the repository is replaced by a recording fake.
 */
function build(flag: boolean) {
  const calls: string[] = [];
  const svc = new RepoIntelService({ config: { repoIntelEnabled: flag } } as never, {} as never);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getEdges: async () => {
      calls.push('edges');
      return [
        { fromFile: 'b.ts', toFile: 'a.ts' },
        { fromFile: 'a.ts', toFile: 'c.ts' },
        { fromFile: 'a.ts', toFile: 'B.ts' },
      ];
    },
    getAllFileRank: async () => {
      calls.push('rank');
      return [
        { path: 'b.ts', rank: 0.2 },
        { path: 'a.ts', rank: 0.7 },
      ];
    },
    getAllFileFacts: async () => {
      calls.push('facts');
      return [
        { path: 'z.ts', endpoints: ['GET /z'], crons: [] },
        { path: 'a.ts', endpoints: [], crons: ['0 * * * *'] },
      ];
    },
  };
  return { svc, calls };
}

describe('RepoIntel.getGraphFacts', () => {
  it('returns edges, ranks and file facts sorted by code unit', async () => {
    const { svc } = build(true);
    const g = await svc.getGraphFacts('r1');
    expect(g.edges).toEqual([
      { from: 'a.ts', to: 'B.ts' },
      { from: 'a.ts', to: 'c.ts' },
      { from: 'b.ts', to: 'a.ts' },
    ]);
    expect(g.ranks.map((r: { path: string }) => r.path)).toEqual(['a.ts', 'b.ts']);
    expect(g.ranks[0]).toEqual({ path: 'a.ts', rank: 0.7 });
    expect(g.fileFacts.map((f: { path: string }) => f.path)).toEqual(['a.ts', 'z.ts']);
    expect(g.fileFacts[1]).toEqual({ path: 'z.ts', endpoints: ['GET /z'], crons: [] });
  });

  it('flag off → empty arrays and no repository read', async () => {
    const { svc, calls } = build(false);
    await expect(svc.getGraphFacts('r1')).resolves.toEqual({ edges: [], ranks: [], fileFacts: [] });
    expect(calls).toEqual([]);
  });
});
