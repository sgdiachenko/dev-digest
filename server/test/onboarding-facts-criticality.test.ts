import { describe, it, expect } from 'vitest';
import { buildCriticalPaths, scoreFiles } from '../src/modules/onboarding/facts/criticality.js';
import type { EcosystemFacts } from '../src/modules/onboarding/facts/ecosystems.js';
import type { TourGraph } from '../src/modules/onboarding/facts/types.js';

const eco = (over: Partial<EcosystemFacts> = {}): EcosystemFacts => ({
  stack: [],
  packages: [],
  entryPoints: [],
  tagged: [],
  memberDirs: [],
  hasWorkspaceMarker: false,
  skippedParse: 0,
  ...over,
});
const noGraph: TourGraph = { edges: [], ranks: [], fileFacts: [] };

describe('onboarding facts: criticality (T10)', () => {
  it('scores by Appendix B weights and orders by score, rank, path', () => {
    const graph: TourGraph = {
      edges: [{ from: 'src/a.ts', to: 'src/auth/token.ts' }],
      ranks: [{ path: 'src/auth/token.ts', rank: 0.5 }],
      fileFacts: [{ path: 'src/routes.ts', endpoints: ['GET /x', 'POST /y'], crons: [] }],
    };
    const scored = scoreFiles({
      paths: ['src/index.ts', 'src/routes.ts', 'src/auth/token.ts', 'package.json', 'README.md', 'src/plain.ts'],
      graph,
      eco: eco({ entryPoints: ['src/index.ts'] }),
    });
    const by = Object.fromEntries(scored.map((s) => [s.path, s]));
    expect(by['src/index.ts']).toMatchObject({ score: 5, tags: ['entry_point'] });
    expect(by['src/routes.ts']).toMatchObject({ score: 4, tags: ['public_surface'], route_count: 2 });
    expect(by['src/auth/token.ts']).toMatchObject({ score: 7, tags: ['high_fan_in', 'security_sensitive'], importer_count: 1 });
    expect(by['package.json']).toMatchObject({ score: 2, tags: ['runtime_config'] });
    expect(by['README.md']).toMatchObject({ score: 1, tags: ['docs'] });
    expect(by['src/plain.ts']).toBeUndefined();
    expect(scored.map((s) => s.path)).toEqual([
      'src/auth/token.ts',
      'src/index.ts',
      'src/routes.ts',
      'package.json',
      'README.md',
    ]);
  });

  it('breaks score ties by rank desc, then path asc', () => {
    const graph: TourGraph = {
      edges: [{ from: 'x', to: 'y' }],
      ranks: [
        { path: 'b/auth.ts', rank: 0.1 },
        { path: 'c/auth.ts', rank: 0.2 },
      ],
      fileFacts: [],
    };
    const scored = scoreFiles({ paths: ['a/auth.ts', 'b/auth.ts', 'c/auth.ts', 'd/auth.ts'], graph, eco: eco() });
    expect(scored.map((s) => s.path)).toEqual(['c/auth.ts', 'b/auth.ts', 'a/auth.ts', 'd/auth.ts']);
  });

  it('excludes tests, vendored dirs and migration files; the migrations dir is one item', () => {
    const scored = scoreFiles({
      paths: [
        'src/auth.test.ts',
        'node_modules/auth/index.js',
        'db/migrations/0001.sql',
        'db/migrations/0002.sql',
        'db/schema/users.ts',
      ],
      graph: noGraph,
      eco: eco(),
    });
    expect(scored.map((s) => s.path).sort()).toEqual(['db/migrations', 'db/schema/users.ts']);
    expect(scored.every((s) => s.tags.includes('data_schema'))).toBe(true);
  });

  it('gives no high_fan_in and null counts without a graph; caps the list at 8', () => {
    const paths = Array.from({ length: 12 }, (_, i) => `src/auth${i}/token.ts`);
    const scored = scoreFiles({ paths, graph: noGraph, eco: eco() });
    expect(scored.some((s) => s.tags.includes('high_fan_in'))).toBe(false);
    expect(scored.every((s) => s.route_count === null && s.importer_count === null)).toBe(true);
    const section = buildCriticalPaths(scored, false);
    expect(section.items).toHaveLength(8);
    expect(section.graph_based).toBe(false);
    expect(section.origin).toBe('facts');
  });

  it('applies convention tags from ecosystems', () => {
    const scored = scoreFiles({
      paths: ['app/Policies/P.php'],
      graph: noGraph,
      eco: eco({ tagged: [{ path: 'app/Policies/P.php', tag: 'security_sensitive' }] }),
    });
    expect(scored[0]?.tags).toEqual(['security_sensitive']);
  });
});
