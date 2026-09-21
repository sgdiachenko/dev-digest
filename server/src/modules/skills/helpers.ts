import { unzipSync, type UnzipFileInfo } from 'fflate';
import type { Skill, SkillDraft, SkillSource, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import { SKILL_NAME_RE, SkillType as SkillTypeEnum } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { DEFAULT_SKILL_TYPE, MAX_IMPORT_BYTES, MAX_SKILL_BODY_CHARS } from './constants.js';
import { assessSkillSafety } from './safety.js';

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

/** True when a persisted run trace's `config.skills` recorded this skill id.
 *  `trace` is untyped jsonb read straight from Postgres — guard every shape. */
export function traceHasSkill(trace: unknown, skillId: string): boolean {
  if (!trace || typeof trace !== 'object') return false;
  const config = (trace as { config?: unknown }).config;
  if (!config || typeof config !== 'object') return false;
  const skills = (config as { skills?: unknown }).skills;
  return Array.isArray(skills) && skills.includes(skillId);
}

export interface StatsAgentRow {
  id: string;
  name: string;
}
export interface StatsFindingRow {
  category: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}
export interface StatsRunRow {
  trace: unknown;
}

/** Raw per-skill rows the repository fetches (already scoped to the skill's
 *  linked agents + the stats window); this function does all the arithmetic. */
export interface SkillStatsRaw {
  skillId: string;
  agents: StatsAgentRow[];
  findings: StatsFindingRow[];
  runs: StatsRunRow[];
}

export function computeSkillStats(raw: SkillStatsRaw): SkillStats {
  const totalRuns = raw.runs.length;
  const runsWithSkill = raw.runs.filter((r) => traceHasSkill(r.trace, raw.skillId)).length;
  const pullPct = totalRuns === 0 ? null : Math.round((runsWithSkill / totalRuns) * 100);

  const triaged = raw.findings.filter((f) => f.acceptedAt !== null || f.dismissedAt !== null);
  const accepted = triaged.filter((f) => f.acceptedAt !== null);
  const acceptPct = triaged.length === 0 ? null : Math.round((accepted.length / triaged.length) * 100);

  const byCategoryMap = new Map<string, number>();
  for (const f of raw.findings) byCategoryMap.set(f.category, (byCategoryMap.get(f.category) ?? 0) + 1);

  return {
    agent_count: raw.agents.length,
    pull_pct: pullPct,
    accept_pct: acceptPct,
    findings_30d: raw.findings.length,
    by_category: [...byCategoryMap.entries()].map(([category, count]) => ({ category, count })),
    agents: raw.agents,
  };
}
