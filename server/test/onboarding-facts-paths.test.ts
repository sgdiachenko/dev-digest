import { describe, it, expect } from 'vitest';
import {
  buildTestStemIndex,
  comparePath,
  hasTestFile,
  isExcluded,
  matchesKeyword,
  topLevelModule,
} from '../src/modules/onboarding/facts/paths.js';

describe('onboarding facts: paths (T6)', () => {
  it('excludes tests, mocks, d.ts, generated dirs, lockfiles and individual migrations', () => {
    for (const p of [
      'src/a.test.ts',
      'src/a.spec.js',
      'src/__tests__/a.ts',
      'test/a.ts',
      'pkg/tests/a.py',
      'src/__mocks__/a.ts',
      'src/__fixtures__/a.json',
      'types/a.d.ts',
      'node_modules/x/index.js',
      'dist/index.js',
      'a/vendor/b.go',
      '.next/x.js',
      'pnpm-lock.yaml',
      'sub/Cargo.lock',
      'db/migrations/0001_init.sql',
    ]) {
      expect(isExcluded(p), p).toBe(true);
    }
  });

  it('keeps ordinary source files and the migrations directory itself', () => {
    for (const p of ['src/index.ts', 'server/src/app.ts', 'README.md', 'db/migrations', 'testing-guide.md']) {
      expect(isExcluded(p), p).toBe(false);
    }
  });

  it('topLevelModule is the first segment, "." for root files', () => {
    expect(topLevelModule('server/src/a.ts')).toBe('server');
    expect(topLevelModule('README.md')).toBe('.');
  });

  it('matchesKeyword matches at a word boundary, case-insensitively', () => {
    expect(matchesKeyword('src/auth/login.ts')).toBe(true);
    expect(matchesKeyword('src/AuthService.ts')).toBe(true);
    expect(matchesKeyword('src/token_store.ts')).toBe(true);
    expect(matchesKeyword('src/middleware.ts')).toBe(true);
    expect(matchesKeyword('src/authors.ts')).toBe(false);
    expect(matchesKeyword('src/tokenizer/count.ts')).toBe(false);
    expect(matchesKeyword('src/author/list.ts')).toBe(false);
  });

  it('comparePath orders by code unit, not locale', () => {
    expect(['b', 'B', 'a', 'A'].sort(comparePath)).toEqual(['A', 'B', 'a', 'b']);
    expect(comparePath('a', 'a')).toBe(0);
  });

  it('hasTestFile finds sibling tests across naming styles', () => {
    const idx = buildTestStemIndex(['src/a.test.ts', 'pkg/test_b.py', 'pkg/c_test.go', 'src/d.ts']);
    expect(hasTestFile('src/a.ts', idx)).toBe(true);
    expect(hasTestFile('pkg/b.py', idx)).toBe(true);
    expect(hasTestFile('pkg/c.go', idx)).toBe(true);
    expect(hasTestFile('src/d.ts', idx)).toBe(false);
  });
});
