import { readFileSync } from 'node:fs';
import path from 'node:path';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { CiSkillEntry } from '@devdigest/shared';
import { sha256Hex } from './hash.js';

/**
 * Reads `.devdigest/skills/<slug>.md` for the manifest's skill slugs, in order.
 * Each file starts with a `---` front matter block carrying `source:`. A skill
 * whose source is not exactly `manual` is wrapped as untrusted data, mirroring
 * the studio (`toSkillBlock`, AC-67); a missing/odd front matter is untrusted.
 * The sha256 is over the file's raw bytes, front matter included (AC-171).
 */

const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export type SkillsResult =
  | { ok: true; entries: CiSkillEntry[]; blocks: string[] }
  | { ok: false; entries: CiSkillEntry[]; missing: string };

/** Split a skill file into its `source:` value (null when absent) and body. */
export function parseSkillFile(text: string): { source: string | null; body: string } {
  const m = FRONT_MATTER.exec(text);
  if (!m) return { source: null, body: text };
  const line = /^source:\s*(.+?)\s*$/m.exec(m[1]!);
  const source = line ? line[1]!.replace(/^["']|["']$/g, '') : null;
  return { source, body: text.slice(m[0].length) };
}

export function readSkills(devdigestDir: string, slugs: readonly string[]): SkillsResult {
  const entries: CiSkillEntry[] = [];
  const blocks: string[] = [];
  for (const slug of slugs) {
    // The slug comes from an editable manifest: never let it leave skills/.
    if (!SAFE_SLUG.test(slug) || slug.includes('..')) return { ok: false, entries, missing: slug };
    let bytes: Buffer;
    try {
      bytes = readFileSync(path.join(devdigestDir, 'skills', `${slug}.md`));
    } catch {
      return { ok: false, entries, missing: slug };
    }
    entries.push({ slug, sha256: sha256Hex(bytes) });
    const { source, body } = parseSkillFile(bytes.toString('utf8'));
    blocks.push(source === 'manual' ? body : wrapUntrusted(`skill:${slug}`, body));
  }
  return { ok: true, entries, blocks };
}
