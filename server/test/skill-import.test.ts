import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  SkillImportError,
  parseImport,
  parseMarkdownSkill,
  parseZipSkill,
  slugifyName,
} from '../src/modules/skills/helpers.js';

/**
 * The import parser's one hard guarantee: an archive's non-markdown entries
 * (scripts, binaries, anything else) are listed in `skipped_files` and are
 * NEVER decoded or executed — only the chosen markdown core is read as text.
 */

describe('parseMarkdownSkill', () => {
  it('parses frontmatter name/description/type when present', () => {
    const draft = parseMarkdownSkill(
      'x.md',
      '---\nname: pr-quality-rubric\ndescription: Rubric for PR quality\ntype: rubric\n---\n# Body\nSome rule.',
      'manual',
    );
    expect(draft).toMatchObject({
      name: 'pr-quality-rubric',
      description: 'Rubric for PR quality',
      type: 'rubric',
      source: 'manual',
      skipped_files: [],
    });
    expect(draft.body).toContain('Some rule.');
  });

  it('falls back to the first H1 (slugified) and first paragraph with no frontmatter', () => {
    const draft = parseMarkdownSkill('x.md', '# No Then Chains\n\nAlways use async/await.\n', 'imported_url');
    expect(draft.name).toBe('no-then-chains');
    expect(draft.description).toBe('Always use async/await.');
    expect(draft.type).toBe('custom');
  });

  it('falls back to the filename when there is no H1', () => {
    const draft = parseMarkdownSkill('secret-leakage-gate.md', 'Just a rule, no heading.', 'manual');
    expect(draft.name).toBe('secret-leakage-gate');
  });

  it('rejects an empty body', () => {
    expect(() => parseMarkdownSkill('x.md', '   \n\n  ', 'manual')).toThrow(SkillImportError);
  });

  it('rejects a body over the size cap', () => {
    const huge = '# H\n' + 'x'.repeat(25_000);
    expect(() => parseMarkdownSkill('x.md', huge, 'manual')).toThrow(SkillImportError);
  });
});

describe('slugifyName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyName('PR Quality Rubric')).toBe('pr-quality-rubric');
  });

  it('strips non-alphanumeric runs', () => {
    expect(slugifyName('  Secret_Leakage!! Gate  ')).toBe('secret-leakage-gate');
  });

  it('never returns something shorter than 3 chars', () => {
    expect(slugifyName('a')).toMatch(/^a-skill$/);
    // Fully non-alphanumeric input collapses to the 'skill' placeholder, which
    // is already long enough — no further suffix needed.
    expect(slugifyName('!!!')).toBe('skill');
  });
});

describe('parseZipSkill', () => {
  it('picks a root SKILL.md as the core and lists everything else as skipped', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('# pr-quality-rubric\nEvaluate PR quality.'),
      'scripts/run.sh': strToU8('#!/bin/sh\necho pwned'),
      'notes.txt': strToU8('side notes'),
    });
    const draft = parseZipSkill('bundle.zip', zip);
    expect(draft.name).toBe('pr-quality-rubric');
    expect(draft.body).toContain('Evaluate PR quality.');
    expect(draft.source).toBe('imported_url');
    expect(draft.skipped_files.sort()).toEqual(['notes.txt', 'scripts/run.sh']);
  });

  it('never decodes a skipped entry — a non-UTF8 script does not break parsing', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('# ok-skill\nFine.'),
      // Bytes that are not valid UTF-8 text; parseMarkdownSkill would choke on
      // this if it were ever decoded. It must not be.
      'bin/tool': new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x02]),
    });
    const draft = parseZipSkill('bundle.zip', zip);
    expect(draft.skipped_files).toEqual(['bin/tool']);
    expect(draft.name).toBe('ok-skill');
  });

  it('falls back to the only markdown file when there is no SKILL.md', () => {
    const zip = zipSync({
      'README.md': strToU8('# my-rule\nDo the thing.'),
      'LICENSE': strToU8('MIT'),
    });
    const draft = parseZipSkill('bundle.zip', zip);
    expect(draft.name).toBe('my-rule');
    expect(draft.skipped_files).toEqual(['LICENSE']);
  });

  it('picks the shallowest markdown file when several exist and none is SKILL.md', () => {
    const zip = zipSync({
      'docs/deep/notes.md': strToU8('# deep\nignored'),
      'top.md': strToU8('# top-level\nused'),
    });
    const draft = parseZipSkill('bundle.zip', zip);
    expect(draft.name).toBe('top-level');
    expect(draft.skipped_files).toEqual(['docs/deep/notes.md']);
  });

  it('rejects a zip with no markdown at all', () => {
    const zip = zipSync({ 'run.sh': strToU8('echo hi') });
    expect(() => parseZipSkill('bundle.zip', zip)).toThrow(SkillImportError);
  });

  it('rejects a malformed zip', () => {
    expect(() => parseZipSkill('bad.zip', new Uint8Array([1, 2, 3]))).toThrow(SkillImportError);
  });

  it('rejects a zip bomb without ever decompressing the oversized entry (CWE-409)', () => {
    // Highly repetitive content compresses to a tiny archive but declares a
    // huge originalSize in its local header — the classic zip-bomb shape.
    // If this ever gets fully decompressed before the size check runs, this
    // test's own heap is the first casualty; that's the point of asserting
    // on the THROWN error rather than on decompressed content.
    const bomb = zipSync({ 'SKILL.md': strToU8('a'.repeat(2_000_000)) });
    // The archive itself must stay far below the compressed-input cap, so the
    // rejection below is provably about the DECLARED decompressed size, not
    // the (also-checked, but different) compressed upload size.
    expect(bomb.byteLength).toBeLessThan(10_000);
    expect(() => parseZipSkill('bomb.zip', bomb)).toThrow(SkillImportError);
    expect(() => parseZipSkill('bomb.zip', bomb)).toThrow(/exceeds the import size limit/);
  });

  it('never decompresses a skipped entry, however large it claims to be', () => {
    // A companion file bigger than the import cap sits ALONGSIDE a small,
    // valid core — it must land in skipped_files, not trip the size check
    // (that check applies only to the entry actually chosen as the core).
    const zip = zipSync({
      'SKILL.md': strToU8('# ok-skill\nFine.'),
      'assets/huge.bin': strToU8('x'.repeat(2_000_000)),
    });
    const draft = parseZipSkill('bundle.zip', zip);
    expect(draft.name).toBe('ok-skill');
    expect(draft.skipped_files).toEqual(['assets/huge.bin']);
  });
});

describe('parseImport', () => {
  it('dispatches .md to the markdown parser', () => {
    const draft = parseImport('rule.md', strToU8('# my-rule\nBody.'));
    expect(draft.name).toBe('my-rule');
  });

  it('dispatches .zip to the zip parser', () => {
    const zip = zipSync({ 'SKILL.md': strToU8('# z\nBody.') });
    const draft = parseImport('bundle.zip', zip);
    expect(draft.name).toBe('z-skill'); // slugified 1-char heading padded to min length
  });

  it('rejects an unsupported extension', () => {
    expect(() => parseImport('rule.txt', strToU8('hi'))).toThrow(SkillImportError);
  });
});
