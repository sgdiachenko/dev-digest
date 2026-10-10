import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseUnifiedDiff as runnerParse } from './diff.js';
// Test-only cross-package import: the bundle itself never imports the server.
import { parseUnifiedDiff as studioParse } from '../../server/src/adapters/git/diff-parser.js';

/**
 * T9 / AC-109 - the runner's parsed diff equals the studio's from the same raw
 * unified diff, on shared fixtures (`test/fixtures/diffs/*.diff`).
 *
 * Both parsers run on identical input, fixtures WITH their final newline.
 */
const FIXTURE_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'diffs');
const fixtures = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.diff'))
  .sort()
  .map((f) => ({ name: f, raw: readFileSync(path.join(FIXTURE_DIR, f), 'utf8') }));

describe('diff parity with the studio parser (AC-109)', () => {
  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
  });

  for (const { name, raw } of fixtures) {
    it(`${name}: identical UnifiedDiff`, () => {
      const input = raw;
      const runner = runnerParse(input);
      expect(runner.files.length).toBeGreaterThan(0);
      expect(runner).toEqual(studioParse(input));
    });
  }
});
