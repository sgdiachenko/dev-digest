import type { CriticalTag, OnboardingReadingItem, OnboardingReadingPath } from '@devdigest/shared';
import { MAX_READING_ITEMS } from './constants.js';
import type { ScoredFile } from './criticality.js';
import { comparePath, isExcluded } from './paths.js';
import type { TourGraph } from './types.js';

export interface ReadingPathInput {
  paths: readonly string[];
  entryPoints: readonly string[];
  scored: readonly ScoredFile[];
  graph: TourGraph;
  graphAvailable: boolean;
}

export function buildReadingPath(input: ReadingPathInput): OnboardingReadingPath {
  const pathSet = new Set(input.paths);
  const tagsOf = new Map(input.scored.map((s) => [s.path, s.tags] as const));
  const rankOf = new Map(input.graph.ranks.map((r) => [r.path, r.rank] as const));
  const rank = (p: string): number => rankOf.get(p) ?? 0;
  const byRank = (a: string, b: string): number => rank(b) - rank(a) || comparePath(a, b);
  const tags = (p: string): CriticalTag[] => tagsOf.get(p) ?? [];

  const entries = input.entryPoints.filter((p) => pathSet.has(p) && !isExcluded(p));
  const items: OnboardingReadingItem[] = [];
  const listed = new Set<string>();
  const add = (
    path: string,
    reason: OnboardingReadingItem['reason'],
    importedBy: number | null,
  ): void => {
    listed.add(path);
    items.push({ position: items.length + 1, path, reason, imported_by_position: importedBy, tags: tags(path) });
  };

  if (input.graphAvailable) {
    const seeds = [...entries].sort(byRank);
    for (const p of seeds) if (items.length < MAX_READING_ITEMS) add(p, 'entry_point', null);
    if (items.length === 0) {
      const top = input.scored[0];
      if (top) add(top.path, 'critical', null);
    }
    const imports = new Map<string, string[]>();
    for (const e of input.graph.edges) {
      const list = imports.get(e.from) ?? [];
      list.push(e.to);
      imports.set(e.from, list);
    }
    // Breadth-first over the files already listed, highest rank first.
    for (let i = 0; i < items.length && items.length < MAX_READING_ITEMS; i += 1) {
      const parent = items[i];
      if (!parent) break;
      const next = [...new Set(imports.get(parent.path) ?? [])]
        .filter((p) => pathSet.has(p) && !isExcluded(p) && !listed.has(p))
        .sort(byRank);
      for (const p of next) {
        if (items.length >= MAX_READING_ITEMS) break;
        add(p, 'imported_by', parent.position);
      }
    }
  } else {
    for (const p of [...entries].sort(comparePath)) if (items.length < MAX_READING_ITEMS) add(p, 'entry_point', null);
    for (const s of input.scored) {
      if (items.length >= MAX_READING_ITEMS) break;
      if (!listed.has(s.path)) add(s.path, 'critical', null);
    }
  }
  return { origin: 'facts', graph_based: input.graphAvailable, items };
}
