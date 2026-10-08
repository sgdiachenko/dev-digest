import { GENERATED_DIRS, LOCKFILE_NAMES, SECURITY_KEYWORDS, SOURCE_EXTENSIONS } from './constants.js';

/** Code-unit comparison (C11): never `localeCompare`. */
export function comparePath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

/** Directory of `path` (`'.'` for a root-level file). */
export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '.' : path.slice(0, i);
}

export function extensionOf(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase();
}

export function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSIONS.includes(extensionOf(path)) && !path.endsWith('.d.ts');
}

/** True when any path segment (directory or file) is a generated/vendored dir. */
export function inGeneratedDir(path: string): boolean {
  return path.split('/').some((seg) => GENERATED_DIRS.includes(seg));
}

/** True for a path *inside* a migrations directory (the directory itself is not). */
export function isMigrationFile(path: string): boolean {
  const segs = path.split('/');
  const i = segs.indexOf('migrations');
  return i >= 0 && i < segs.length - 1;
}

/** Appendix B exclusions, shared by the critical-paths and reading-path sections. */
export function isExcluded(path: string): boolean {
  const p = `/${path}`;
  if (p.includes('.test.') || p.includes('.spec.')) return true;
  if (p.includes('/__tests__/') || p.includes('/test/') || p.includes('/tests/')) return true;
  if (p.includes('/__mocks__/') || p.includes('/__fixtures__/')) return true;
  if (path.endsWith('.d.ts')) return true;
  if (inGeneratedDir(path)) return true;
  if (LOCKFILE_NAMES.includes(basename(path))) return true;
  if (isMigrationFile(path)) return true;
  return false;
}

/** First path segment, or `'.'` for a root-level file. */
export function topLevelModule(path: string): string {
  const i = path.indexOf('/');
  return i < 0 ? '.' : path.slice(0, i);
}

function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase());
}

function stemOf(name: string): string {
  const i = name.indexOf('.', 1);
  return i < 0 ? name : name.slice(0, i);
}

/**
 * Case-insensitive word-boundary match of a keyword against any directory
 * segment or the file stem (`authService`, `auth_service` and `auth.ts` match
 * `auth`; `authors.ts` does not).
 */
export function matchesKeyword(path: string, keywords: readonly string[] = SECURITY_KEYWORDS): boolean {
  const segs = path.split('/');
  const parts = segs.map((seg, i) => (i === segs.length - 1 ? stemOf(seg) : seg));
  for (const part of parts) {
    for (const w of words(part)) if (keywords.includes(w)) return true;
  }
  return false;
}

const TEST_NAME_RE = /(?:\.test\.|\.spec\.|_test\.|^test_)/;

function testStemOf(name: string): string | null {
  if (!TEST_NAME_RE.test(name)) return null;
  const stem = stemOf(name)
    .replace(/_test$/, '')
    .replace(/^test_/, '');
  return stem.length > 0 ? stem : null;
}

/** Stems (`foo` for `foo.test.ts`, `test_foo.py`, `foo_test.go`) of every test file. */
export function buildTestStemIndex(paths: readonly string[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const p of paths) {
    const stem = testStemOf(basename(p));
    if (stem !== null) out.add(stem);
  }
  return out;
}

/** True when some test file in the tree is named after `path`'s file. */
export function hasTestFile(path: string, testStems: ReadonlySet<string>): boolean {
  return testStems.has(stemOf(basename(path)));
}
