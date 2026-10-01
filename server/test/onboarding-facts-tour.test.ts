import { describe, it, expect } from 'vitest';
import { OnboardingSections } from '@devdigest/shared';
import { buildSections, buildTourFacts } from '../src/modules/onboarding/facts/tour.js';
import type { TourInput } from '../src/modules/onboarding/facts/types.js';

const tree = [
  'package.json',
  'pnpm-lock.yaml',
  'README.md',
  '.env.example',
  'src/index.ts',
  'src/auth/session.ts',
  'src/util.ts',
  'src/util.test.ts',
  'docs/guide.md',
].map((path, i) => ({ path, oid: String(i).padStart(40, '0'), size: 10 }));

const base: TourInput = {
  sourceSha: 'a'.repeat(40),
  tree,
  files: [
    { path: 'package.json', text: JSON.stringify({ main: 'src/index.ts', scripts: { dev: 'tsx src/index.ts', test: 'vitest' } }) },
    { path: 'README.md', text: '# X\n\n## Quick start\n\n```sh\npnpm install\n```\n' },
    { path: '.env.example', text: 'TOKEN=abc123secret\n' },
  ],
  graph: {
    edges: [
      { from: 'src/index.ts', to: 'src/auth/session.ts' },
      { from: 'src/index.ts', to: 'src/util.ts' },
    ],
    ranks: [
      { path: 'src/auth/session.ts', rank: 0.6 },
      { path: 'src/util.ts', rank: 0.4 },
    ],
    fileFacts: [{ path: 'src/index.ts', endpoints: ['GET /health'], crons: [] }],
  },
  grep: { todo: [{ path: 'src/util.ts', line: 4 }], goMain: [], springApp: [] },
  skipped: 2,
};

const shuffled = (input: TourInput): TourInput => ({
  ...input,
  tree: [...input.tree].reverse(),
  files: [...input.files].reverse(),
  graph: {
    edges: [...input.graph.edges].reverse(),
    ranks: [...input.graph.ranks].reverse(),
    fileFacts: [...input.graph.fileFacts].reverse(),
  },
});

describe('onboarding facts: tour assembly (T15)', () => {
  it('builds sections that satisfy the OnboardingSections contract', () => {
    const sections = buildSections(base);
    expect(() => OnboardingSections.parse(sections)).not.toThrow();
    expect(sections.critical_paths.graph_based).toBe(true);
    expect(sections.critical_paths.items[0]?.path).toBe('src/index.ts');
    expect(sections.reading_path.items.map((i) => i.path)).toEqual(['src/index.ts', 'src/auth/session.ts', 'src/util.ts']);
    expect(sections.run_locally.groups[0]?.commands.map((c) => c.command)).toContain('pnpm dev');
    expect(sections.first_tasks.items[0]).toMatchObject({ signal: 'todo_comment', path: 'src/util.ts', line: 4 });
  });

  it('is invariant to the order of the input arrays', () => {
    expect(buildSections(shuffled(base))).toEqual(buildSections(base));
  });

  it('never leaks env values and counts caller + parse skips', () => {
    const facts = buildTourFacts({
      ...base,
      files: [...base.files, { path: 'sub/package.json', text: '{broken' }],
      tree: [...base.tree, { path: 'sub/package.json', oid: 'f'.repeat(40), size: 7 }],
    });
    expect(JSON.stringify(facts.sections)).not.toContain('abc123secret');
    expect(facts.skipped).toBe(3);
  });

  it('degrades to heuristic sections with no graph (EC-2)', () => {
    const sections = buildSections({ ...base, graph: { edges: [], ranks: [], fileFacts: [] } });
    expect(sections.architecture.diagram).toBeNull();
    expect(sections.critical_paths.graph_based).toBe(false);
    expect(sections.reading_path.graph_based).toBe(false);
    expect(sections.reading_path.items[0]?.reason).toBe('entry_point');
  });

  it('handles an empty repository without throwing', () => {
    const sections = buildSections({
      sourceSha: 'b'.repeat(40),
      tree: [],
      files: [],
      graph: { edges: [], ranks: [], fileFacts: [] },
      grep: { todo: [], goMain: [], springApp: [] },
      skipped: 0,
    });
    expect(sections.run_locally.groups).toEqual([]);
    expect(sections.architecture.modules).toEqual([]);
  });
});
