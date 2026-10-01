import { OnboardingSections } from '@devdigest/shared';
import { buildArchitecture } from './architecture.js';
import { buildCriticalPaths, isGraphAvailable, scoreFiles } from './criticality.js';
import { detectEcosystems } from './ecosystems.js';
import { buildFirstTasks } from './first-tasks.js';
import { classifyFile } from './manifests.js';
import { comparePath, dirname } from './paths.js';
import { parseReadme } from './readme.js';
import { buildReadingPath } from './reading-path.js';
import { buildRunLocally } from './run-locally.js';
import type { TourInput } from './types.js';

export interface TourFacts {
  sections: OnboardingSections;
  /** Files skipped by the caller plus manifests that failed to parse. */
  skipped: number;
}

/** Deterministic: the same input (in any order) yields identical sections (NFR-4). */
export function buildTourFacts(input: TourInput): TourFacts {
  const paths = input.tree.map((f) => f.path).sort(comparePath);
  const files = [...input.files].sort((a, b) => comparePath(a.path, b.path));
  const graphAvailable = isGraphAvailable(input.graph);

  const eco = detectEcosystems({ paths, files, grep: input.grep });
  const scored = scoreFiles({ paths, graph: input.graph, eco });

  const rootReadme = files.find((f) => classifyFile(f.path) === 'readme' && dirname(f.path) === '.');
  const readme = rootReadme ? parseReadme(rootReadme.text) : null;

  const sections = {
    architecture: buildArchitecture({ paths, graph: input.graph, eco }),
    critical_paths: buildCriticalPaths(scored, graphAvailable),
    run_locally: buildRunLocally({ packages: eco.packages, paths, files }),
    reading_path: buildReadingPath({
      paths,
      entryPoints: eco.entryPoints,
      scored,
      graph: input.graph,
      graphAvailable,
    }),
    first_tasks: buildFirstTasks({
      paths,
      graph: input.graph,
      graphAvailable,
      todo: input.grep.todo,
      readmePath: rootReadme?.path ?? null,
      readmeHasSetup: readme?.hasSetupSection ?? true,
    }),
  };
  return { sections: OnboardingSections.parse(sections), skipped: input.skipped + eco.skippedParse };
}

export function buildSections(input: TourInput): OnboardingSections {
  return buildTourFacts(input).sections;
}
