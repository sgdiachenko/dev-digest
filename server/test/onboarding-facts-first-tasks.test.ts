import { describe, it, expect } from 'vitest';
import { buildFirstTasks } from '../src/modules/onboarding/facts/first-tasks.js';
import type { TourGraph } from '../src/modules/onboarding/facts/types.js';

const graph: TourGraph = {
  edges: [{ from: 'a.ts', to: 'src/core.ts' }],
  ranks: [
    { path: 'src/core.ts', rank: 0.9 },
    { path: 'src/tested.ts', rank: 0.8 },
    { path: 'src/other.ts', rank: 0.7 },
    { path: 'src/vendor/x.ts', rank: 0.99 },
  ],
  fileFacts: [{ path: 'src/api.ts', endpoints: ['GET /x'], crons: [] }],
};

describe('onboarding facts: first tasks (T13)', () => {
  it('draws signals in order with complexity low/medium, max 4, existing paths only', () => {
    const out = buildFirstTasks({
      paths: ['src/core.ts', 'src/tested.ts', 'src/tested.test.ts', 'src/other.ts', 'src/api.ts', 'src/old.ts', 'README.md'],
      graph,
      graphAvailable: true,
      todo: [
        { path: 'src/old.ts', line: 7 },
        { path: 'src/old.ts', line: 3 },
        { path: 'gone.ts', line: 1 },
        { path: 'src/a.test.ts', line: 1 },
      ],
      readmePath: 'README.md',
      readmeHasSetup: false,
    });
    expect(out.items.map((t) => [t.signal, t.path, t.line, t.complexity])).toEqual([
      ['todo_comment', 'src/old.ts', 3, 'low'],
      ['missing_test', 'src/core.ts', null, 'medium'],
      ['missing_test', 'src/other.ts', null, 'medium'],
      ['route_without_test', 'src/api.ts', null, 'medium'],
    ]);
    expect(out.items.every((t) => t.path_kind === 'file')).toBe(true);
    expect(new Set(out.items.map((t) => t.id)).size).toBe(out.items.length);
  });

  it('README task appears when there is room and the README lacks a setup section', () => {
    const out = buildFirstTasks({
      paths: ['README.md'],
      graph: { edges: [], ranks: [], fileFacts: [] },
      graphAvailable: false,
      todo: [],
      readmePath: 'README.md',
      readmeHasSetup: false,
    });
    expect(out.items).toEqual([
      expect.objectContaining({ signal: 'readme_missing_setup', path: 'README.md', complexity: 'low' }),
    ]);
  });

  it('no ranks-based task without a graph; none when README has setup', () => {
    const out = buildFirstTasks({
      paths: ['src/core.ts', 'README.md'],
      graph: { ...graph, edges: [] },
      graphAvailable: false,
      todo: [],
      readmePath: 'README.md',
      readmeHasSetup: true,
    });
    expect(out.items).toEqual([]);
  });
});
