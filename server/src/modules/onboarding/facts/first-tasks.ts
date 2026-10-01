import type { OnboardingFirstTask, OnboardingFirstTasks } from '@devdigest/shared';
import { MAX_FIRST_TASKS, MAX_TASKS_PER_SIGNAL } from './constants.js';
import {
  buildTestStemIndex,
  comparePath,
  hasTestFile,
  isExcluded,
  isSourceFile,
} from './paths.js';
import type { TourGraph, TourGrepMatch } from './types.js';

export interface FirstTasksInput {
  paths: readonly string[];
  graph: TourGraph;
  graphAvailable: boolean;
  todo: readonly TourGrepMatch[];
  /** Root README path, when one exists. */
  readmePath: string | null;
  readmeHasSetup: boolean;
}

export function buildFirstTasks(input: FirstTasksInput): OnboardingFirstTasks {
  const pathSet = new Set(input.paths);
  const testStems = buildTestStemIndex(input.paths);
  const eligible = (p: string): boolean => pathSet.has(p) && !isExcluded(p);

  // 1. TODO / FIXME comments.
  const todo = [...input.todo]
    .filter((m) => eligible(m.path))
    .sort((a, b) => comparePath(a.path, b.path) || a.line - b.line);
  const todoTasks: OnboardingFirstTask[] = [];
  const seenFiles = new Set<string>();
  for (const m of todo) {
    if (seenFiles.has(m.path)) continue;
    seenFiles.add(m.path);
    todoTasks.push({
      id: `todo_comment#${m.path}:${m.line}`,
      signal: 'todo_comment',
      path: m.path,
      path_kind: 'file',
      line: m.line,
      complexity: 'low',
    });
  }

  // 2. Top-ranked source files without a test file (needs ranks).
  const missingTests: OnboardingFirstTask[] = input.graphAvailable
    ? [...input.graph.ranks]
        .filter((r) => r.rank > 0 && eligible(r.path) && isSourceFile(r.path) && !hasTestFile(r.path, testStems))
        .sort((a, b) => b.rank - a.rank || comparePath(a.path, b.path))
        .map((r) => ({
          id: `missing_test#${r.path}`,
          signal: 'missing_test' as const,
          path: r.path,
          path_kind: 'file' as const,
          line: null,
          complexity: 'medium' as const,
        }))
    : [];

  // 3. Files that declare routes but have no test file.
  const routeTasks: OnboardingFirstTask[] = [...input.graph.fileFacts]
    .filter((f) => f.endpoints.length > 0 && eligible(f.path) && !hasTestFile(f.path, testStems))
    .sort((a, b) => comparePath(a.path, b.path))
    .map((f) => ({
      id: `route_without_test#${f.path}`,
      signal: 'route_without_test' as const,
      path: f.path,
      path_kind: 'file' as const,
      line: null,
      complexity: 'medium' as const,
    }));

  // 4. A README with no setup/run section.
  const readmeTasks: OnboardingFirstTask[] =
    input.readmePath !== null && !input.readmeHasSetup && pathSet.has(input.readmePath)
      ? [
          {
            id: `readme_missing_setup#${input.readmePath}`,
            signal: 'readme_missing_setup',
            path: input.readmePath,
            path_kind: 'file',
            line: null,
            complexity: 'low',
          },
        ]
      : [];

  const used = new Set<string>();
  const items: OnboardingFirstTask[] = [];
  for (const group of [todoTasks, missingTests, routeTasks, readmeTasks]) {
    let taken = 0;
    for (const t of group) {
      if (taken >= MAX_TASKS_PER_SIGNAL) break;
      if (used.has(t.path) && t.signal !== 'todo_comment') continue;
      used.add(t.path);
      items.push(t);
      taken += 1;
    }
  }
  return { origin: 'facts', items: items.slice(0, MAX_FIRST_TASKS) };
}
