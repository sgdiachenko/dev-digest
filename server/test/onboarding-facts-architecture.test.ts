import { describe, it, expect } from 'vitest';
import { buildArchitecture, buildModules } from '../src/modules/onboarding/facts/architecture.js';
import type { EcosystemFacts } from '../src/modules/onboarding/facts/ecosystems.js';
import type { TourGraph } from '../src/modules/onboarding/facts/types.js';

const eco: EcosystemFacts = {
  stack: [{ kind: 'ecosystem', name: 'Go', evidence_path: 'go.mod', confidence: 'verified' }],
  packages: [],
  entryPoints: ['cmd/api/main.go'],
  tagged: [],
  memberDirs: [],
  hasWorkspaceMarker: false,
  skippedParse: 0,
};

describe('onboarding facts: architecture (T11)', () => {
  it('lists modules by file count desc then path, and builds a template summary', () => {
    const paths = ['b/1.go', 'b/2.go', 'a/1.go', 'c/1.go', 'README.md', 'node_modules/x/1.js'];
    const arch = buildArchitecture({ paths, graph: { edges: [], ranks: [], fileFacts: [] }, eco });
    expect(arch.modules).toEqual([
      { path: 'b', file_count: 2 },
      { path: 'a', file_count: 1 },
      { path: 'c', file_count: 1 },
    ]);
    expect(arch.summary).toBe('Built with Go. 3 top-level modules. Entry points: cmd/api/main.go.');
    expect(arch.diagram).toBeNull();
  });

  it('draws a diagram with ids m0.. and aggregated import counts when a graph exists', () => {
    const graph: TourGraph = {
      edges: [
        { from: 'b/1.go', to: 'a/1.go' },
        { from: 'b/2.go', to: 'a/1.go' },
        { from: 'a/1.go', to: 'a/2.go' },
        { from: 'a/1.go', to: 'c/1.go' },
      ],
      ranks: [],
      fileFacts: [],
    };
    const arch = buildArchitecture({
      paths: ['a/1.go', 'a/2.go', 'a/3.go', 'b/1.go', 'b/2.go', 'c/1.go'],
      graph,
      eco,
    });
    expect(arch.diagram?.nodes).toEqual([
      { id: 'm0', path: 'a' },
      { id: 'm1', path: 'b' },
      { id: 'm2', path: 'c' },
    ]);
    expect(arch.diagram?.edges).toEqual([
      { from: 'm0', to: 'm2', import_count: 1 },
      { from: 'm1', to: 'm0', import_count: 2 },
    ]);
  });

  it('limits the diagram to the 20 largest modules', () => {
    const paths: string[] = [];
    for (let i = 0; i < 25; i += 1) for (let j = 0; j <= i; j += 1) paths.push(`m${String(i).padStart(2, '0')}/f${j}.go`);
    const graph: TourGraph = { edges: [{ from: 'm24/f0.go', to: 'm23/f0.go' }], ranks: [], fileFacts: [] };
    const arch = buildArchitecture({ paths, graph, eco });
    expect(arch.modules).toHaveLength(25);
    expect(arch.diagram?.nodes).toHaveLength(20);
    expect(arch.diagram?.nodes[0]).toEqual({ id: 'm0', path: 'm24' });
  });

  it('flat repo: root-only module list and no diagram (EC-17)', () => {
    expect(buildModules(['a.go', 'b.go'], [])).toEqual([{ path: '.', file_count: 2 }]);
    const arch = buildArchitecture({
      paths: ['a.go', 'b.go'],
      graph: { edges: [{ from: 'a.go', to: 'b.go' }], ranks: [], fileFacts: [] },
      eco,
    });
    expect(arch.diagram).toBeNull();
  });

  it('adds workspace members as modules', () => {
    expect(buildModules(['apps/web/a.ts', 'apps/web/b.ts', 'apps/api/c.ts'], ['apps/web'])).toEqual([
      { path: 'apps', file_count: 3 },
      { path: 'apps/web', file_count: 2 },
    ]);
  });
});
