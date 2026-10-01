import type { CriticalTag, OnboardingCriticalItem, OnboardingCriticalPaths } from '@devdigest/shared';
import {
  HIGH_FAN_IN_PERCENTILE,
  MAX_CRITICAL_ITEMS,
  SCHEMA_SEGMENTS,
  TAG_ORDER,
  TAG_WEIGHTS,
} from './constants.js';
import type { EcosystemFacts } from './ecosystems.js';
import { classifyFile } from './manifests.js';
import { basename, comparePath, isExcluded, isMigrationFile, matchesKeyword } from './paths.js';
import type { TourGraph } from './types.js';

export interface ScoredFile {
  path: string;
  score: number;
  tags: CriticalTag[];
  rank: number;
  route_count: number | null;
  importer_count: number | null;
}

export function isGraphAvailable(graph: TourGraph): boolean {
  return graph.edges.length > 0;
}

function stemOf(name: string): string {
  const i = name.indexOf('.', 1);
  return i < 0 ? name : name.slice(0, i);
}

function isSchemaFile(path: string): boolean {
  const segs = path.split('/');
  const name = segs[segs.length - 1] ?? '';
  if (segs.slice(0, -1).some((s) => SCHEMA_SEGMENTS.includes(s))) return true;
  if (SCHEMA_SEGMENTS.includes(stemOf(name))) return true;
  if (name.endsWith('.proto') || name.endsWith('.graphql')) return true;
  return /^(openapi|swagger)\./.test(name);
}

function isRuntimeConfig(path: string): boolean {
  const name = basename(path);
  const kind = classifyFile(path);
  if (kind === 'manifest' || kind === 'compose' || kind === 'env_example') return true;
  if (name === 'Dockerfile' || name.startsWith('Dockerfile.')) return true;
  return path.startsWith('.github/workflows/') || path.includes('/.github/workflows/');
}

function isDocs(path: string): boolean {
  const name = basename(path);
  return /^(README|CONTRIBUTING|ARCHITECTURE)/i.test(name) || path.startsWith('docs/adr/') || path.includes('/docs/adr/');
}

/** Number of values in `sorted` that are <= `v`. */
function countAtMost(sorted: readonly number[], v: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] ?? 0) <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface CriticalityInput {
  paths: readonly string[];
  graph: TourGraph;
  eco: EcosystemFacts;
}

/** Every tagged, non-excluded file, ordered by (score desc, rank desc, path asc). */
export function scoreFiles(input: CriticalityInput): ScoredFile[] {
  const { graph, eco } = input;
  const graphOn = isGraphAvailable(graph);
  const rankOf = new Map(graph.ranks.map((r) => [r.path, r.rank] as const));
  const sortedRanks = graph.ranks.map((r) => r.rank).sort((a, b) => a - b);
  const facts = new Map(graph.fileFacts.map((f) => [f.path, f] as const));
  const importers = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    const set = importers.get(e.to) ?? new Set<string>();
    set.add(e.from);
    importers.set(e.to, set);
  }
  const entry = new Set(eco.entryPoints);
  const tagged = new Map<string, Set<CriticalTag>>();
  for (const t of eco.tagged) {
    const set = tagged.get(t.path) ?? new Set<CriticalTag>();
    set.add(t.tag);
    tagged.set(t.path, set);
  }

  const out: ScoredFile[] = [];
  const consider = (path: string, extra: CriticalTag[]): void => {
    const tags = new Set<CriticalTag>(extra);
    if (entry.has(path)) tags.add('entry_point');
    const f = facts.get(path);
    if (f && f.endpoints.length + f.crons.length > 0) tags.add('public_surface');
    for (const t of tagged.get(path) ?? []) tags.add(t);
    const rank = rankOf.get(path) ?? 0;
    if (graphOn && rank > 0 && (countAtMost(sortedRanks, rank) / sortedRanks.length) * 100 >= HIGH_FAN_IN_PERCENTILE) {
      tags.add('high_fan_in');
    }
    if (matchesKeyword(path)) tags.add('security_sensitive');
    if (isSchemaFile(path)) tags.add('data_schema');
    if (isRuntimeConfig(path)) tags.add('runtime_config');
    if (isDocs(path)) tags.add('docs');
    if (tags.size === 0) return;
    const ordered = TAG_ORDER.filter((t) => tags.has(t));
    const routes = f ? f.endpoints.length : 0;
    const imp = importers.get(path)?.size ?? 0;
    out.push({
      path,
      score: ordered.reduce((sum, t) => sum + TAG_WEIGHTS[t], 0),
      tags: ordered,
      rank,
      route_count: routes > 0 ? routes : null,
      importer_count: imp > 0 ? imp : null,
    });
  };

  const migrationDirs = new Set<string>();
  for (const p of input.paths) {
    if (isMigrationFile(p)) {
      const segs = p.split('/');
      migrationDirs.add(segs.slice(0, segs.indexOf('migrations') + 1).join('/'));
      continue;
    }
    if (isExcluded(p)) continue;
    consider(p, []);
  }
  // The migrations directory appears once, as a single data_schema item.
  const firstDir = [...migrationDirs].filter((d) => !isExcluded(d)).sort(comparePath)[0];
  if (firstDir !== undefined) consider(firstDir, ['data_schema']);

  return out.sort((a, b) => b.score - a.score || b.rank - a.rank || comparePath(a.path, b.path));
}

export function buildCriticalPaths(scored: readonly ScoredFile[], graphBased: boolean): OnboardingCriticalPaths {
  const items: OnboardingCriticalItem[] = scored.slice(0, MAX_CRITICAL_ITEMS).map((s) => ({
    path: s.path,
    score: s.score,
    tags: s.tags,
    route_count: s.route_count,
    importer_count: s.importer_count,
  }));
  return { origin: 'facts', graph_based: graphBased, items };
}
