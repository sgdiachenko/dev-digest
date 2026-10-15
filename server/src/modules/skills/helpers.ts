import { unzipSync, type UnzipFileInfo } from 'fflate';
import type { Skill, SkillDraft, SkillSource, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import { SKILL_NAME_RE, SkillType as SkillTypeEnum } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { DEFAULT_SKILL_TYPE, MAX_IMPORT_BYTES, MAX_SKILL_BODY_CHARS } from './constants.js';
import { assessSkillSafety } from './safety.js';
import { acceptFigures, isRecordedSkillList, wholePercent } from '../_shared/stats-rules.js';
import type { SkillStatsFacts, SkillStatsWindow } from './types.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, the import
 * parser (markdown / zip → SkillDraft, never executing anything), the
 * Versions-tab line diff, and the Stats-tab aggregation. No I/O: repository.ts
 * fetches rows, everything here is a pure function over them (unit-testable
 * without a DB).
 */

// ---------------------------------------------------------------- DTO mapping

export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    safety: assessSkillSafety(row.body),
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    note: row.note ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

// ------------------------------------------------------------------- Import

/** Slugify arbitrary text into something `SKILL_NAME_RE` accepts. */
export function slugifyName(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  // Re-trim a trailing dash left by the length cap, and guard the (rare)
  // fully-non-alphanumeric input.
  const trimmed = slug.replace(/-+$/g, '') || 'skill';
  return trimmed.length < 3 ? `${trimmed}-skill`.slice(0, 50) : trimmed;
}

interface ParsedMarkdown {
  name?: string;
  description?: string;
  type?: SkillType;
  body: string;
}

/** Parse optional `---` frontmatter (name/description/type) off a markdown
 *  file. Unknown/malformed frontmatter is ignored, never thrown — the file
 *  still imports with the H1/paragraph fallback. */
function parseFrontmatter(text: string): ParsedMarkdown {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { body: text };
  const [, front, rest] = match;
  const fields: Record<string, string> = {};
  for (const line of front!.split(/\r?\n/)) {
    const kv = /^([a-zA-Z_]+):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    fields[kv[1]!.toLowerCase()] = kv[2]!.trim().replace(/^["']|["']$/g, '');
  }
  const type = SkillTypeEnum.safeParse(fields.type);
  return {
    ...(fields.name ? { name: fields.name } : {}),
    ...(fields.description ? { description: fields.description } : {}),
    ...(type.success ? { type: type.data } : {}),
    body: rest!,
  };
}

/** First `# H1` heading, slugified — the import name fallback. */
function firstHeading(body: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(body);
  return match?.[1]?.trim();
}

/** First non-empty, non-heading line — the import description fallback. */
function firstParagraph(body: string): string | undefined {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    return trimmed;
  }
  return undefined;
}

export class SkillImportError extends Error {}

/** Parse one markdown file's bytes into a `SkillDraft`. Never persists. */
export function parseMarkdownSkill(
  filename: string,
  content: string,
  source: SkillSource,
): SkillDraft {
  const parsed = parseFrontmatter(content);
  const body = parsed.body.trim();
  if (body.length === 0) throw new SkillImportError(`${filename} has no content`);
  if (body.length > MAX_SKILL_BODY_CHARS) {
    throw new SkillImportError(`${filename} exceeds the ${MAX_SKILL_BODY_CHARS}-character skill body limit`);
  }

  const rawName = parsed.name ?? firstHeading(body) ?? filename.replace(/\.md$/i, '');
  const name = slugifyName(rawName);
  if (!SKILL_NAME_RE.test(name)) {
    throw new SkillImportError(`Could not derive a valid skill name from ${filename}`);
  }

  return {
    name,
    description: parsed.description ?? firstParagraph(body) ?? '',
    type: parsed.type ?? DEFAULT_SKILL_TYPE,
    body,
    source,
    skipped_files: [],
  };
}

/** Extensions we will decode and read as text; everything else in an archive
 *  is listed in `skipped_files` and never opened. */
const MARKDOWN_RE = /\.md$/i;

/**
 * Parse a zip archive into a `SkillDraft`. Picks the skill's markdown core —
 * root `SKILL.md`, else the only `*.md` file, else the shallowest `*.md` — and
 * reports every OTHER entry (scripts, binaries, nested files) as skipped.
 * Those entries are never decoded, read, or executed.
 *
 * Two-pass by design: fflate's `filter` fires with each entry's DECLARED
 * `originalSize` from the zip's central directory before that entry is
 * inflated, so pass 1 lists every entry (`filter` always returns `false` —
 * nothing is decompressed yet) and pass 2 decompresses ONLY the chosen core
 * file, after its declared size is checked. A single `unzipSync(bytes)` call
 * with no filter inflates every entry unconditionally regardless of its
 * declared size — an attacker-controlled zip bomb (a small file that claims
 * to be gigabytes once inflated) would exhaust server memory before this
 * function ever gets to look at a single byte of content.
 */
export function parseZipSkill(filename: string, bytes: Uint8Array): SkillDraft {
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new SkillImportError(`${filename} exceeds the import size limit`);
  }

  const listed: UnzipFileInfo[] = [];
  try {
    // filter always false: reads the central directory only, decompresses nothing.
    unzipSync(bytes, {
      filter: (f) => {
        listed.push(f);
        return false;
      },
    });
  } catch {
    throw new SkillImportError(`${filename} is not a valid zip archive`);
  }

  const paths = listed.filter((f) => !f.name.endsWith('/')).map((f) => f.name); // drop dir entries
  const mdPaths = paths.filter((p) => MARKDOWN_RE.test(p));
  if (mdPaths.length === 0) {
    throw new SkillImportError(`${filename} contains no markdown file`);
  }

  const rootSkillMd = mdPaths.find((p) => /^SKILL\.md$/i.test(p) || /(^|\/)SKILL\.md$/i.test(p));
  const core =
    rootSkillMd ??
    (mdPaths.length === 1 ? mdPaths[0]! : [...mdPaths].sort((a, b) => a.split('/').length - b.split('/').length)[0]!);

  const coreInfo = listed.find((f) => f.name === core)!;
  if (coreInfo.originalSize > MAX_IMPORT_BYTES) {
    throw new SkillImportError(`${core} exceeds the import size limit once decompressed`);
  }

  // Decompress ONLY the chosen core entry — every other entry (skipped or
  // not) stays unread, whatever it claims its size is.
  const decompressed = unzipSync(bytes, { filter: (f) => f.name === core });
  const text = new TextDecoder().decode(decompressed[core]!);
  const skipped = paths.filter((p) => p !== core);

  const draft = parseMarkdownSkill(core.split('/').pop() ?? core, text, 'imported_url');
  return { ...draft, skipped_files: skipped };
}

/** Entry point used by the service: dispatch on the uploaded file's extension.
 *  `content` is the raw (already base64-decoded) file bytes. */
export function parseImport(filename: string, content: Uint8Array): SkillDraft {
  if (content.byteLength > MAX_IMPORT_BYTES) {
    throw new SkillImportError('Import exceeds the size limit');
  }
  if (/\.zip$/i.test(filename)) return parseZipSkill(filename, content);
  if (/\.md$/i.test(filename)) {
    return parseMarkdownSkill(filename, new TextDecoder().decode(content), 'imported_url');
  }
  throw new SkillImportError('Only .md and .zip files can be imported');
}

// --------------------------------------------------------------- Versions diff

export type DiffLineKind = 'add' | 'del' | 'ctx';
export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/**
 * Line-level diff via the classic LCS table. Skill bodies are short (capped at
 * `MAX_SKILL_BODY_CHARS`), so the O(n·m) table is cheap; this trades a smarter
 * algorithm for a dependency-free, easily-unit-tested one.
 */
export function lineDiff(oldBody: string, newBody: string): DiffLine[] {
  const a = oldBody.split('\n');
  const b = newBody.split('\n');
  const n = a.length;
  const m = b.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'ctx', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: 'del', text: a[i]! });
      i++;
    } else {
      out.push({ kind: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ kind: 'del', text: a[i++]! });
  while (j < m) out.push({ kind: 'add', text: b[j++]! });
  return out;
}

// ----------------------------------------------------------------- Stats tab

const byNameThenId = (a: { id: string; name: string }, b: { id: string; name: string }): number =>
  a.name.localeCompare(b.name, 'en') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

type StatsRun = SkillStatsFacts['runs'][number];

/** Facts partitioned once so a list of skills does not re-scan every run per skill. */
export interface SkillRunIndex {
  /** The facts and window this index was built for — `computeSkillStats` rejects a mismatch. */
  facts: SkillStatsFacts;
  fromMs: number;
  toMs: number;
  /** runId -> its finding rows, so a skill reads only its own runs' findings. */
  findingsByRun: Map<string, SkillStatsFacts['runFindings']>;
  /** Window runs grouped by agent id (runs with a null agent are not pull candidates). */
  windowByAgent: Map<string, { run: StatsRun; recorded: boolean }[]>;
  /** skillId -> window runs that recorded the skill. */
  windowBySkill: Map<string, StatsRun[]>;
  /** skillId -> latest `ranAt` over all runs (not window-limited). */
  lastUsed: Map<string, Date>;
}

export function indexSkillRuns(facts: SkillStatsFacts, window: SkillStatsWindow): SkillRunIndex {
  const fromMs = window.from.getTime();
  const toMs = window.to.getTime();
  const windowByAgent: SkillRunIndex['windowByAgent'] = new Map();
  const windowBySkill: SkillRunIndex['windowBySkill'] = new Map();
  const lastUsed: SkillRunIndex['lastUsed'] = new Map();
  const findingsByRun: SkillRunIndex['findingsByRun'] = new Map();
  for (const f of facts.runFindings) {
    const list = findingsByRun.get(f.runId) ?? [];
    list.push(f);
    findingsByRun.set(f.runId, list);
  }
  for (const r of facts.runs) {
    const recorded = isRecordedSkillList(r.skills);
    const ids = recorded ? new Set(r.skills as string[]) : null;
    if (ids) {
      for (const id of ids) {
        const prev = lastUsed.get(id);
        if (prev === undefined || r.ranAt > prev) lastUsed.set(id, r.ranAt);
      }
    }
    const t = r.ranAt.getTime();
    if (t < fromMs || t >= toMs) continue;
    if (r.agentId !== null) {
      const list = windowByAgent.get(r.agentId) ?? [];
      list.push({ run: r, recorded });
      windowByAgent.set(r.agentId, list);
    }
    if (ids) {
      for (const id of ids) {
        const list = windowBySkill.get(id) ?? [];
        list.push(r);
        windowBySkill.set(id, list);
      }
    }
  }
  return { facts, fromMs, toMs, findingsByRun, windowByAgent, windowBySkill, lastUsed };
}

/**
 * One skill's stats over `window`, by the agent-performance rules
 * (`_shared/stats-rules.ts`). Pure: `facts.runs` hold counted statuses at any
 * time, so the window figures filter by `[from, to)` and `last_used_at`
 * reads all of them. Pass a shared `index` when computing many skills.
 */
export function computeSkillStats(
  skillId: string,
  facts: SkillStatsFacts,
  window: SkillStatsWindow,
  asOf: Date,
  index: SkillRunIndex = indexSkillRuns(facts, window),
): SkillStats {
  if (index.facts !== facts || index.fromMs !== window.from.getTime() || index.toMs !== window.to.getTime()) {
    throw new Error('computeSkillStats: index was built for different facts or window');
  }
  const linked = new Map<string, { id: string; name: string }>();
  for (const l of facts.links) {
    if (l.skillId === skillId) linked.set(l.agentId, { id: l.agentId, name: l.agentName });
  }
  const agents = [...linked.values()].sort(byNameThenId);

  // Pull: linked agents' runs that recorded a skill list.
  let linkedCount = 0;
  let pullBaseCount = 0;
  let pullRuns = 0;
  for (const agentId of linked.keys()) {
    for (const { run, recorded } of index.windowByAgent.get(agentId) ?? []) {
      linkedCount++;
      if (!recorded) continue;
      pullBaseCount++;
      if ((run.skills as string[]).includes(skillId)) pullRuns++;
    }
  }
  const pullPct = pullBaseCount === 0 ? null : wholePercent(pullRuns / pullBaseCount);

  // Skill runs: any agent (linked, unlinked, deleted) that loaded the skill.
  const skillRuns = index.windowBySkill.get(skillId) ?? [];
  const doneSkillRunIds = new Set(skillRuns.filter((r) => r.status === 'done').map((r) => r.id));

  let accepted = 0;
  let dismissed = 0;
  let pending = 0;
  const categories = new Map<string, number>();
  for (const runId of doneSkillRunIds) {
    for (const f of index.findingsByRun.get(runId) ?? []) {
      accepted += f.accepted;
      dismissed += f.dismissed;
      pending += f.pending;
      categories.set(f.category, (categories.get(f.category) ?? 0) + f.accepted + f.dismissed + f.pending);
    }
  }
  const findings = accepted + dismissed + pending;
  const { accept_rate, small_sample } = acceptFigures(accepted, dismissed);

  const lastUsed = index.lastUsed.get(skillId) ?? null;

  return {
    agent_count: agents.length,
    agents,
    pull_pct: pullPct,
    accept_pct: accept_rate === null ? null : wholePercent(accept_rate),
    findings_30d: findings,
    by_category: [...categories.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0)),
    findings,
    skill_runs: skillRuns.length,
    pull_runs: pullRuns,
    pull_runs_total: pullBaseCount,
    runs_without_skill_data: linkedCount - pullBaseCount,
    accepted,
    dismissed,
    pending,
    accept_rate,
    small_sample,
    last_used_at: lastUsed ? lastUsed.toISOString() : null,
    period: { from: window.from.toISOString(), to: window.to.toISOString() },
    as_of: asOf.toISOString(),
  };
}
