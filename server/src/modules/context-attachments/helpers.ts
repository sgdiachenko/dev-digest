/**
 * Pure helpers of the attachments use case: run ordering / de-duplication, the greedy
 * token-budget plan, and the Live-log line. No I/O, no ports.
 */
import { ProjectContextSkipReason } from '@devdigest/shared';
import type { DocRef } from './types.js';

export interface RunCandidate {
  path: string;
  source: 'agent' | 'skill';
  /** Name of the attaching skill; null for the agent's own attachments. */
  skillName: string | null;
  /** Set when an earlier candidate already carries the same path (only the first is injected). */
  duplicate: boolean;
}

/**
 * The run's document list: the agent's own paths first (saved order), then each injected
 * skill's paths in `agent_skills.order`. A path keeps its FIRST position; later occurrences
 * stay in the list flagged `duplicate` so the trace can name them. Paths belong to one repo.
 */
export function orderRunCandidates(
  own: string[],
  skillsInOrder: { name: string; paths: string[] }[],
): RunCandidate[] {
  const seen = new Set<string>();
  const out: RunCandidate[] = [];
  const add = (path: string, source: RunCandidate['source'], skillName: string | null) => {
    out.push({ path, source, skillName, duplicate: seen.has(path) });
    seen.add(path);
  };
  for (const path of own) add(path, 'agent', null);
  for (const skill of skillsInOrder) for (const path of skill.paths) add(path, 'skill', skill.name);
  return out;
}

export interface PlanItem {
  estTokens: number | null;
  /** False for items that are never injected (duplicates, unreadable, missing): not counted, never skipped. */
  eligible?: boolean;
}

export interface InjectionPlan {
  /** Estimated tokens of everything that fits. */
  total: number;
  /** Parallel to the input: `over_budget` for an eligible item that would be dropped. */
  would_skip: ('over_budget' | null)[];
}

/**
 * Greedy fit: items are taken in order; one that would push the total past `budget` is skipped
 * whole and the scan CONTINUES, so a later, smaller item can still fit (AC-22).
 */
export function planInjection(items: PlanItem[], budget: number): InjectionPlan {
  let total = 0;
  const would_skip = items.map((item): 'over_budget' | null => {
    if (item.eligible === false) return null;
    const cost = item.estTokens ?? 0;
    if (total + cost > budget) return 'over_budget';
    total += cost;
    return null;
  });
  return { total, would_skip };
}

/** Attachments that occur more than once (second and later occurrences), each reported once. */
export function findDuplicates(refs: DocRef[]): DocRef[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const dupes: DocRef[] = [];
  for (const ref of refs) {
    const key = `${ref.repoId}\u0000${ref.path}`;
    if (seen.has(key) && !reported.has(key)) {
      reported.add(key);
      dupes.push(ref);
    }
    seen.add(key);
  }
  return dupes;
}

/** Injected documents whose path the PR's diff also changes (the model got the default-branch version). */
export function touchedByDiff(diffPaths: string[], injected: string[]): string[] {
  const changed = new Set(diffPaths);
  return injected.filter((path) => changed.has(path));
}

/** `Project context: N docs, ≈T tokens[ × N calls][, skipped M (reason: count, …)]` */
export function formatContextLine(input: {
  n: number;
  tokens: number;
  skipped: Partial<Record<ProjectContextSkipReason, number>>;
  calls: number;
}): string {
  let line = `Project context: ${input.n} docs, ≈${input.tokens} tokens`;
  if (input.calls > 1) line += ` × ${input.calls} calls`;
  const parts = ProjectContextSkipReason.options
    .map((reason) => [reason, input.skipped[reason] ?? 0] as const)
    .filter(([, count]) => count > 0);
  const skipped = parts.reduce((sum, [, count]) => sum + count, 0);
  if (skipped > 0) {
    line += `, skipped ${skipped} (${parts.map(([reason, count]) => `${reason}: ${count}`).join(', ')})`;
  }
  return line;
}
