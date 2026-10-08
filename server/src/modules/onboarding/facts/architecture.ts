import type { OnboardingArchitecture, OnboardingModule } from '@devdigest/shared';
import { MAX_DIAGRAM_NODES, SUMMARY_TEMPLATE } from './constants.js';
import type { EcosystemFacts } from './ecosystems.js';
import { comparePath, inGeneratedDir, topLevelModule } from './paths.js';
import type { TourGraph } from './types.js';
import { isGraphAvailable } from './criticality.js';

export interface ArchitectureInput {
  paths: readonly string[];
  graph: TourGraph;
  eco: EcosystemFacts;
}

export function buildModules(paths: readonly string[], memberDirs: readonly string[]): OnboardingModule[] {
  const counts = new Map<string, number>();
  let rootFiles = 0;
  for (const p of paths) {
    if (inGeneratedDir(p)) continue;
    const top = topLevelModule(p);
    if (top === '.') rootFiles += 1;
    else counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  for (const dir of memberDirs) {
    if (counts.has(dir)) continue;
    const n = paths.filter((p) => p.startsWith(`${dir}/`) && !inGeneratedDir(p)).length;
    if (n > 0) counts.set(dir, n);
  }
  if (counts.size === 0 && rootFiles > 0) counts.set('.', rootFiles);
  return [...counts.entries()]
    .map(([path, file_count]) => ({ path, file_count }))
    .sort((a, b) => b.file_count - a.file_count || comparePath(a.path, b.path));
}

function summarize(eco: EcosystemFacts, moduleCount: number): string {
  const names = eco.stack
    .filter((s) => s.kind !== 'package_manager')
    .map((s) => s.name);
  const parts = [names.length > 0 ? SUMMARY_TEMPLATE.stack(names.join(', ')) : SUMMARY_TEMPLATE.noStack];
  parts.push(SUMMARY_TEMPLATE.modules(moduleCount));
  if (eco.entryPoints.length > 0) parts.push(SUMMARY_TEMPLATE.entryPoints(eco.entryPoints.slice(0, 3).join(', ')));
  return parts.join(' ');
}

export function buildArchitecture(input: ArchitectureInput): OnboardingArchitecture {
  const { eco, graph } = input;
  const modules = buildModules(input.paths, eco.memberDirs);
  let diagram: OnboardingArchitecture['diagram'] = null;

  if (isGraphAvailable(graph) && modules.length >= 2) {
    const nodes = modules.slice(0, MAX_DIAGRAM_NODES).map((m, i) => ({ id: `m${i}`, path: m.path }));
    // Longest module path first, so a workspace member wins over its top-level dir.
    const byLength = [...nodes].sort((a, b) => b.path.length - a.path.length || comparePath(a.path, b.path));
    const moduleOf = (file: string): string | null => {
      for (const n of byLength) {
        if (n.path === '.' ? !file.includes('/') : file.startsWith(`${n.path}/`)) return n.id;
      }
      return null;
    };
    const agg = new Map<string, { from: string; to: string; import_count: number }>();
    for (const e of graph.edges) {
      const from = moduleOf(e.from);
      const to = moduleOf(e.to);
      if (from === null || to === null || from === to) continue;
      const key = `${from}\u0000${to}`;
      const cur = agg.get(key);
      if (cur) cur.import_count += 1;
      else agg.set(key, { from, to, import_count: 1 });
    }
    const edges = [...agg.values()].sort((a, b) => comparePath(a.from, b.from) || comparePath(a.to, b.to));
    diagram = { nodes, edges };
  }

  return {
    origin: 'facts',
    summary: summarize(eco, modules.length),
    stack: eco.stack,
    modules,
    diagram,
  };
}
