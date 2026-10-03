import { describe, it, expect } from 'vitest';
import type { ScoredFile } from '../src/modules/onboarding/facts/criticality.js';
import { buildReadingPath } from '../src/modules/onboarding/facts/reading-path.js';
import type { TourGraph } from '../src/modules/onboarding/facts/types.js';

const scored = (path: string, score: number): ScoredFile => ({
  path,
  score,
  tags: ['docs'],
  rank: 0,
  route_count: null,
  importer_count: null,
});

describe('onboarding facts: reading path (T12)', () => {
  it('graph: entry points by rank, then BFS over imports, highest rank first', () => {
    const graph: TourGraph = {
      edges: [
        { from: 'e1.ts', to: 'x.ts' },
        { from: 'e1.ts', to: 'y.ts' },
        { from: 'e2.ts', to: 'y.ts' },
        { from: 'x.ts', to: 'z.ts' },
        { from: 'e2.ts', to: 'a.test.ts' },
      ],
      ranks: [
        { path: 'e1.ts', rank: 0.1 },
        { path: 'e2.ts', rank: 0.3 },
        { path: 'x.ts', rank: 0.2 },
        { path: 'y.ts', rank: 0.5 },
      ],
      fileFacts: [],
    };
    const out = buildReadingPath({
      paths: ['e1.ts', 'e2.ts', 'x.ts', 'y.ts', 'z.ts', 'a.test.ts'],
      entryPoints: ['e1.ts', 'e2.ts'],
      scored: [],
      graph,
      graphAvailable: true,
    });
    expect(out.graph_based).toBe(true);
    expect(out.items.map((i) => [i.position, i.path, i.reason, i.imported_by_position])).toEqual([
      [1, 'e2.ts', 'entry_point', null],
      [2, 'e1.ts', 'entry_point', null],
      [3, 'y.ts', 'imported_by', 1],
      [4, 'x.ts', 'imported_by', 2],
      [5, 'z.ts', 'imported_by', 4],
    ]);
  });

  it('caps at 7 items even with many entry points (EC-18)', () => {
    const entries = Array.from({ length: 12 }, (_, i) => `cmd/c${String(i).padStart(2, '0')}/main.go`);
    for (const graphAvailable of [true, false]) {
      const out = buildReadingPath({
        paths: entries,
        entryPoints: entries,
        scored: [],
        graph: { edges: graphAvailable ? [{ from: entries[0] ?? '', to: entries[1] ?? '' }] : [], ranks: [], fileFacts: [] },
        graphAvailable,
      });
      expect(out.items).toHaveLength(7);
    }
  });

  it('no graph: entry points then critical files in score order, labelled by reason', () => {
    const out = buildReadingPath({
      paths: ['main.go', 'a.go', 'b.go'],
      entryPoints: ['main.go'],
      scored: [scored('a.go', 5), scored('main.go', 5), scored('b.go', 2)],
      graph: { edges: [], ranks: [], fileFacts: [] },
      graphAvailable: false,
    });
    expect(out.graph_based).toBe(false);
    expect(out.items.map((i) => [i.path, i.reason])).toEqual([
      ['main.go', 'entry_point'],
      ['a.go', 'critical'],
      ['b.go', 'critical'],
    ]);
    expect(out.items[1]?.tags).toEqual(['docs']);
  });

  it('excludes test files and paths absent from the tree', () => {
    const out = buildReadingPath({
      paths: ['main.ts'],
      entryPoints: ['main.ts', 'ghost.ts', 'x.test.ts'],
      scored: [],
      graph: { edges: [], ranks: [], fileFacts: [] },
      graphAvailable: false,
    });
    expect(out.items.map((i) => i.path)).toEqual(['main.ts']);
  });
});
