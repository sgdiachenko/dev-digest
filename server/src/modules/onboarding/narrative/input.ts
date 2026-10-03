import { MAX_EXCERPT_BYTES, MAX_EXCERPTS, MAX_INPUT_TOKENS } from './constants.js';
import type { NarrativeFactsInput } from './types.js';

export interface NarrativeExcerpt {
  path: string;
  content: string;
}

export interface BuildNarrativeInputArgs {
  facts: NarrativeFactsInput;
  /** Rendered repository map (repo-derived text). */
  repoMap: string;
  excerpts: readonly NarrativeExcerpt[];
  /** Injected token counter. */
  count: (text: string) => number;
  /** Injected untrusted framing (`wrapUntrusted`). */
  frame: (label: string, content: string) => string;
}

export interface NarrativeInput {
  userMessage: string;
  includedPaths: string[];
  tokens: number;
}

const ENV_NAME = /^\.env(\.|$)/i;
const ENV_EXAMPLE = /^\.env(\.[\w-]+)?\.(example|sample|template|dist)$/i;
const README = /^readme(\.|$)/i;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
/** `.env*` files are never sent, except example files (names only). */
const isEnvExample = (p: string): boolean => ENV_EXAMPLE.test(baseName(p));
const isEnvFile = (p: string): boolean => ENV_NAME.test(baseName(p)) && !isEnvExample(p);

/** Deterministic list (<= MAX_EXCERPTS) of paths worth excerpting. */
export function selectExcerptPaths(facts: NarrativeFactsInput): string[] {
  const s = facts.sections;
  const ordered = [
    ...s.reading_path.items.filter((i) => i.reason === 'entry_point').map((i) => i.path),
    ...s.critical_paths.items.map((i) => i.path),
    ...s.reading_path.items.map((i) => i.path),
    ...facts.stack.map((e) => e.evidence_path),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of ordered) {
    if (seen.has(p) || !facts.paths.has(p)) continue;
    if (isEnvFile(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= MAX_EXCERPTS) break;
  }
  return out;
}

function capBytes(text: string): string {
  const bytes = encoder.encode(text);
  if (bytes.length <= MAX_EXCERPT_BYTES) return text;
  // fatal=false drops a cut-in-half trailing code point as U+FFFD; trim it.
  return decoder.decode(bytes.slice(0, MAX_EXCERPT_BYTES)).replace(/�+$/, '');
}

/** Env example files contribute variable NAMES only, never values. */
function envNamesOnly(text: string): string {
  const names = new Set<string>();
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m) names.add(m[1]!);
  }
  return [...names].sort().join('\n');
}

interface Block {
  text: string;
  paths: string[];
}

/** Shrink a block line-by-line until it fits `room` tokens; null if nothing fits. */
function fit(
  label: string,
  lines: string[],
  paths: string[],
  room: number,
  args: BuildNarrativeInputArgs,
): Block | null {
  let n = lines.length;
  while (n > 0) {
    const text = args.frame(label, lines.slice(0, n).join('\n'));
    if (args.count(text) <= room) return { text, paths };
    n = n > 8 ? Math.floor(n / 2) : n - 1;
  }
  return null;
}

/** Appended to every user message; repository text may be in any language, the narrative never is. */
export const LANGUAGE_REMINDER =
  'Language: write every text field (body_markdown, description, note, title) in English, even if the repository text above is in another language. Keep paths, identifiers and commands verbatim.';

/**
 * Assemble the single user message, filled in priority order until the token
 * budget is reached: entry points > critical files > route facts > commands >
 * repo map > README excerpt. All repo-derived text goes through `frame`.
 */
export function buildNarrativeInput(args: BuildNarrativeInputArgs): NarrativeInput {
  const { facts, count } = args;
  const s = facts.sections;
  const allowed = new Set(selectExcerptPaths(facts));
  const excerpts = args.excerpts
    .filter((e) => allowed.has(e.path))
    .slice(0, MAX_EXCERPTS)
    .map((e) => ({
      path: e.path,
      content: capBytes(isEnvExample(e.path) ? envNamesOnly(e.content) : e.content),
    }));
  const readmes = excerpts.filter((e) => README.test(baseName(e.path)));
  const others = excerpts.filter((e) => !README.test(baseName(e.path)));
  const excerptLines = (list: typeof excerpts): string[] =>
    list.flatMap((e) => [`--- ${e.path} ---`, e.content]);

  const critical = s.critical_paths.items.filter((i) => !isEnvFile(i.path));
  const entry = s.reading_path.items.filter((i) => i.reason === 'entry_point' && !isEnvFile(i.path));
  const routes = critical.filter((i) => (i.route_count ?? 0) > 0);
  const commands = s.run_locally.groups.flatMap((g) =>
    g.commands.map((c) => ({ g, c })),
  );
  // The model may only reference tasks by id, so it has to be shown the ids.
  const tasks = s.first_tasks.items.filter((t) => !isEnvFile(t.path));

  const specs: Array<{ label: string; lines: string[]; paths: string[] }> = [
    {
      label: 'entry-points',
      lines: entry.map((i) => i.path),
      paths: entry.map((i) => i.path),
    },
    {
      label: 'critical-files',
      lines: critical.map((i) => `${i.path} [${i.tags.join(',')}]`),
      paths: critical.map((i) => i.path),
    },
    {
      label: 'critical-file-excerpts',
      lines: excerptLines(others),
      paths: others.map((e) => e.path),
    },
    {
      label: 'route-facts',
      lines: routes.map((i) => `${i.path}: ${i.route_count} routes`),
      paths: routes.map((i) => i.path),
    },
    {
      label: 'commands',
      lines: commands.map(({ g, c }) => `${c.id} (${g.package_path}, ${c.phase}): ${c.command}`),
      paths: [],
    },
    {
      label: 'first-tasks',
      lines: tasks.map((t) => `${t.id} (${t.signal}, ${t.path_kind}, ${t.complexity}): ${t.path}`),
      paths: tasks.map((t) => t.path),
    },
    { label: 'repo-map', lines: args.repoMap.split('\n'), paths: [] },
    { label: 'readme-excerpt', lines: excerptLines(readmes), paths: readmes.map((e) => e.path) },
  ];

  const header = `source_sha: ${facts.source_sha}`;
  let tokens = count(header);
  const parts = [header];
  const included = new Set<string>();
  for (const spec of specs) {
    if (spec.lines.length === 0) continue;
    const block = fit(spec.label, spec.lines, spec.paths, MAX_INPUT_TOKENS - tokens - 1, args);
    if (!block) continue;
    parts.push(block.text);
    tokens += count(block.text) + 1;
    for (const p of block.paths) included.add(p);
  }
  // Last thing the model reads: some models answer in their own default language otherwise.
  parts.push(LANGUAGE_REMINDER);
  const userMessage = parts.join('\n\n');
  return { userMessage, includedPaths: [...included].sort(), tokens: count(userMessage) };
}
