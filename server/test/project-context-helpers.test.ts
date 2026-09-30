import { describe, it, expect } from 'vitest';
import type { GitTreeEntry, Tokenizer } from '@devdigest/shared';
import {
  categorize,
  classifyDoc,
  decodeUtf8Strict,
  hasSecret,
  isEligiblePath,
  selectEntries,
} from '../src/modules/project-context/helpers.js';
import { MAX_CATALOG_ENTRIES, MAX_DOC_BYTES } from '../src/modules/project-context/constants.js';

const blob = (path: string, mode = '100644', size = 10): GitTreeEntry => ({
  path,
  mode,
  type: 'blob',
  oid: 'a'.repeat(40),
  size,
});
const tokenizer: Tokenizer = { count: (s) => s.length };
const enc = (s: string) => new TextEncoder().encode(s);

describe('isEligiblePath (AC-2)', () => {
  it.each([
    ['README.MD', true],
    ['docs/x.mdx', true],
    ['.devdigest/specs/a.md', true],
    ['node_modules/a.md', false],
    ['pkg/vendor/a.md', false],
    ['.github/a.md', false],
    ['docs/.hidden/a.md', false],
    ['docs/a.txt', false],
  ])('%s -> %s', (path, expected) => {
    expect(isEligiblePath(path)).toBe(expected);
  });
});

describe('categorize (AC-3)', () => {
  it.each([
    ['.devdigest/specs/a.md', 'specs'],
    ['docs/specs/a.md', 'specs'],
    ['specs/INSIGHTS.md', 'specs'],
    ['server/INSIGHTS.md', 'insights'],
    ['notes/insights/a.md', 'insights'],
    ['README.md', 'docs'],
  ])('%s -> %s', (path, expected) => {
    expect(categorize(path)).toBe(expected);
  });
});

describe('selectEntries', () => {
  it('drops symlinks (mode 120000) and counts them', () => {
    const r = selectEntries([blob('a.md'), blob('link.md', '120000', 9)]);
    expect(r.entries.map((e) => e.path)).toEqual(['a.md']);
    expect(r.skipped.symlink).toBe(1);
  });

  it('drops non-blob entries (gitlink) and excluded paths', () => {
    const gitlink: GitTreeEntry = { path: 'sub.md', mode: '160000', type: 'commit', oid: 'b'.repeat(40), size: null };
    const r = selectEntries([gitlink, blob('node_modules/x.md'), blob('ok.md')]);
    expect(r.entries.map((e) => e.path)).toEqual(['ok.md']);
    expect(r.skipped).toMatchObject({ non_blob: 1, excluded: 1 });
  });

  it('caps at 1000, sorted by code unit, reporting the total', () => {
    const tree = Array.from({ length: MAX_CATALOG_ENTRIES + 1 }, (_, i) => blob(`d/${String(1000 - i).padStart(4, '0')}.md`));
    tree.push(blob('B.md'));
    const r = selectEntries(tree);
    expect(r.entries).toHaveLength(MAX_CATALOG_ENTRIES);
    expect(r.truncated).toBe(true);
    expect(r.totalFiles).toBe(MAX_CATALOG_ENTRIES + 2);
    expect(r.skipped.over_cap).toBe(2);
    const paths = r.entries.map((e) => e.path);
    expect(paths).toEqual([...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(paths[0]).toBe('B.md'); // uppercase sorts before lowercase by code unit
  });
});

describe('classifyDoc', () => {
  it('too_large is decided by size alone, without tokens', () => {
    expect(classifyDoc(MAX_DOC_BYTES + 1, null, tokenizer)).toEqual({
      status: 'too_large',
      est_tokens: null,
      secret_warning: false,
    });
  });
  it('0 bytes -> empty with 0 tokens', () => {
    expect(classifyDoc(0, null, tokenizer)).toEqual({ status: 'empty', est_tokens: 0, secret_warning: false });
  });
  it('invalid UTF-8 -> unreadable, null tokens', () => {
    const r = classifyDoc(2, new Uint8Array([0xff, 0xfe]), tokenizer);
    expect(r).toEqual({ status: 'unreadable', est_tokens: null, secret_warning: false });
  });
  it('unread non-empty blob -> unreadable', () => {
    expect(classifyDoc(5, null, tokenizer).status).toBe('unreadable');
  });
  it('ok -> tokens from the injected tokenizer', () => {
    expect(classifyDoc(5, enc('hello'), tokenizer)).toEqual({ status: 'ok', est_tokens: 5, secret_warning: false });
  });
  it('flags a secret', () => {
    expect(classifyDoc(20, enc('key AKIAABCDEFGHIJKLMNOP'), tokenizer).secret_warning).toBe(true);
  });
});

describe('hasSecret', () => {
  it.each([
    'sk_live_abcdefgh1234',
    'sk-abcdefghijklmnopqrstuvwx',
    'AKIAABCDEFGHIJKLMNOP',
    '-----BEGIN RSA PRIVATE KEY-----',
    `ghp_${'a'.repeat(36)}`,
    'uses service_role key',
  ])('detects %s', (text) => {
    expect(hasSecret(text)).toBe(true);
  });
  it('ignores ordinary prose', () => {
    expect(hasSecret('# Title\n\nJust docs about sk and AKIA prefixes.')).toBe(false);
  });
});

describe('decodeUtf8Strict', () => {
  it('decodes valid and rejects invalid', () => {
    expect(decodeUtf8Strict(enc('héllo'))).toBe('héllo');
    expect(decodeUtf8Strict(new Uint8Array([0xc3, 0x28]))).toBeNull();
  });
});
