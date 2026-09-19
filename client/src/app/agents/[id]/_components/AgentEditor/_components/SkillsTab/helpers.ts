import type { AgentSkillLink } from "@devdigest/shared";

/** Ordered skill ids from the agent's current links (order ascending). */
export function orderedIdsFrom(links: AgentSkillLink[]): string[] {
  return [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
}

/** Move the id at `index` up (-1) or down (+1) within the ordered list. A
 *  no-op at either edge. */
export function moveId(ids: string[], index: number, dir: -1 | 1): string[] {
  const target = index + dir;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Move a linked skill to another linked skill's position. */
export function moveIdTo(ids: string[], sourceId: string, targetId: string): string[] {
  const from = ids.indexOf(sourceId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, sourceId);
  return next;
}

/** Add/remove a skill id from the ordered list — checked appends at the end,
 *  unchecked removes wherever it was. */
export function toggleId(ids: string[], id: string, checked: boolean): string[] {
  if (checked) return ids.includes(id) ? ids : [...ids, id];
  return ids.filter((x) => x !== id);
}
