import type { NarrativeSectionKey, OnboardingNarrativeSections } from '@devdigest/shared';
import { MAX_ARCH_BODY, MAX_DESC, MAX_TASK_TITLE } from './constants.js';
import { rewriteLinks } from './markdown-links.js';
import { checkFlowchart } from './mermaid.js';
import type { NarrativeModelOutput } from './output-schema.js';
import type { NarrativeFactsInput } from './types.js';

export interface GroundedNarrative {
  sections: OnboardingNarrativeSections;
  fallback: NarrativeSectionKey[];
}

/** Section result: a value, or null = fall back to the facts version. */
type Grounded<T> = T | null;

function describeItems(
  items: ReadonlyArray<{ path: string; description: string }> | null,
  factPaths: readonly string[],
  known: ReadonlySet<string>,
): Grounded<Array<{ path: string; description: string }>> {
  if (!items) return null;
  const allowed = new Set(factPaths.filter((p) => known.has(p)));
  const byPath = new Map<string, string>();
  for (const it of items) {
    if (!allowed.has(it.path)) continue; // unknown path: drop the item
    const description = it.description.trim();
    if (description === '' || description.length > MAX_DESC) return null; // section falls back
    if (!byPath.has(it.path)) byPath.set(it.path, description);
  }
  // Facts order wins over the model's order.
  const out = factPaths
    .filter((p) => byPath.has(p))
    .map((path) => ({ path, description: byPath.get(path)! }));
  return out.length > 0 ? out : null;
}

function groundArchitecture(
  arch: NarrativeModelOutput['architecture'],
  facts: NarrativeFactsInput,
): Grounded<{ body_markdown: string; diagram_mermaid: string | null }> {
  if (!arch) return null;
  const body = arch.body_markdown.trim();
  if (body === '' || body.length > MAX_ARCH_BODY) return null;
  return {
    body_markdown: rewriteLinks(body, facts.paths),
    diagram_mermaid: checkFlowchart(arch.diagram_mermaid),
  };
}

function groundRunLocally(
  items: NarrativeModelOutput['run_locally'],
  facts: NarrativeFactsInput,
): Grounded<NonNullable<OnboardingNarrativeSections['run_locally']>> {
  if (!items) return null;
  const notes = new Map<string, string | null>();
  const order: string[] = [];
  for (const it of items) {
    if (!facts.commandIds.has(it.command_id) || notes.has(it.command_id)) continue;
    const note = it.note === null ? null : it.note.trim();
    if (note !== null && note.length > MAX_DESC) return null;
    notes.set(it.command_id, note === '' ? null : note);
    order.push(it.command_id);
  }
  if (order.length === 0) return null;
  const out: NonNullable<OnboardingNarrativeSections['run_locally']> = [];
  for (const group of facts.sections.run_locally.groups) {
    const inGroup = new Set(group.commands.map((c) => c.id));
    // Reorder within the group only; commands the model skipped keep facts order.
    const ids = [
      ...order.filter((id) => inGroup.has(id)),
      ...group.commands.map((c) => c.id).filter((id) => !notes.has(id)),
    ];
    for (const command_id of ids) {
      out.push({ command_id, position: out.length, note: notes.get(command_id) ?? null });
    }
  }
  return out;
}

function groundFirstTasks(
  items: NarrativeModelOutput['first_tasks'],
  facts: NarrativeFactsInput,
): Grounded<NonNullable<OnboardingNarrativeSections['first_tasks']>> {
  if (!items) return null;
  const factTasks = facts.sections.first_tasks.items;
  const byId = new Map<string, NonNullable<OnboardingNarrativeSections['first_tasks']>[number]>();
  for (const it of items) {
    const fact = factTasks.find((t) => t.id === it.task_id);
    if (!fact || !facts.taskIds.has(it.task_id) || byId.has(it.task_id)) continue;
    const title = it.title.trim();
    const description = it.description.trim();
    if (title === '' || title.length > MAX_TASK_TITLE) return null;
    if (description === '' || description.length > MAX_DESC) return null;
    byId.set(it.task_id, {
      task_id: it.task_id,
      title,
      description,
      // The model may only choose low|medium; anything else keeps the facts value.
      complexity: it.complexity === 'low' || it.complexity === 'medium' ? it.complexity : fact.complexity,
    });
  }
  const out = factTasks.filter((t) => byId.has(t.id)).map((t) => byId.get(t.id)!);
  return out.length > 0 ? out : null;
}

/**
 * Validate and ground one model output against the facts: unknown
 * paths/ids are dropped, commands and numbers come only from facts, and a
 * section that fails validation becomes null and is listed in `fallback`.
 */
export function groundNarrative(
  output: NarrativeModelOutput,
  facts: NarrativeFactsInput,
): GroundedNarrative {
  const s = facts.sections;
  const sections: OnboardingNarrativeSections = {
    architecture: groundArchitecture(output.architecture, facts),
    critical_paths: describeItems(
      output.critical_paths,
      s.critical_paths.items.map((i) => i.path),
      facts.paths,
    ),
    run_locally: groundRunLocally(output.run_locally, facts),
    reading_path: describeItems(
      output.reading_path,
      s.reading_path.items.map((i) => i.path),
      facts.paths,
    ),
    first_tasks: groundFirstTasks(output.first_tasks, facts),
  };
  const keys: NarrativeSectionKey[] = [
    'architecture',
    'critical_paths',
    'run_locally',
    'reading_path',
    'first_tasks',
  ];
  return { sections, fallback: keys.filter((k) => sections[k] === null) };
}
