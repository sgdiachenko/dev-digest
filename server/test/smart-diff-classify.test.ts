import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/modules/smart-diff/classify.js';
import { SMART_DIFF_ROLE_ORDER } from '../src/modules/smart-diff/constants.js';

/**
 * One row per classification rule: a path that SHOULD match it, and a
 * near-identical path that should NOT (and falls through to `core`, or to
 * whatever a lower-priority rule would classify it as).
 */
describe('classifyFile — per-rule table', () => {
  it.each([
    // ---- boilerplate ----
    ['package-lock.json', 'boilerplate'],
    ['server/pnpm-lock.yaml', 'boilerplate'],
    ['my-package-lock.json.txt', 'core'],
    ['client/dist/app.min.js', 'boilerplate'],
    ['client/src/app.js', 'core'],
    ['a.snap', 'boilerplate'],
    ['src/__snapshots__/a.ts', 'boilerplate'],
    ['src/snapshot.ts', 'core'],
    ['dist/index.js', 'boilerplate'],
    ['distribution/index.js', 'core'],
    ['server/build/out.js', 'boilerplate'],
    ['server/rebuild/out.js', 'core'],
    ['coverage/lcov.info', 'boilerplate'],
    ['coverage-report.md', 'docs'],
    ['node_modules/foo/index.js', 'boilerplate'],
    ['my-node_modules-backup/x.ts', 'core'],

    // ---- tests ----
    ['src/foo.test.ts', 'tests'],
    ['src/foo.testing.ts', 'core'],
    ['src/foo.spec.tsx', 'tests'],
    ['src/foo.specs.ts', 'core'],
    ['src/__tests__/foo.ts', 'tests'],
    ['src/tests/foo.ts', 'core'],
    ['e2e/specs/10-smart-diff.flow.json', 'tests'],
    ['e2etests/foo.json', 'core'],

    // ---- wiring ----
    ['.claude/skills/security/SKILL.md', 'wiring'],
    ['myclaude/skills/x.md', 'docs'],
    ['.github/workflows/ci.yml', 'wiring'],
    ['mygithub/workflows/ci.yml', 'core'],
    ['tsconfig.json', 'wiring'],
    ['my-tsconfig-notes.json', 'core'],
    ['vite.config.ts', 'wiring'],
    ['Dockerfile', 'wiring'],
    ['docker-compose.yml', 'wiring'],

    // ---- docs ----
    ['docs/plans/smart-diff.md', 'docs'],
    ['server/docs/architecture.md', 'docs'],
    ['docs-legacy/x.md', 'docs'], // *.md fallback still applies
    ['README.md', 'docs'],
    ['readme.MD', 'docs'], // case-insensitive base name
    ['CHANGELOG.md', 'docs'],
    ['LICENSE', 'docs'],
    ['server/AGENTS.md', 'docs'],
    ['notes.mdx', 'core'],

    // ---- fallback ----
    ['server/src/modules/pulls/service.ts', 'core'],
  ])('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});

/**
 * Disputed cases spelled out with the priority reasoning behind them (D9).
 */
describe('classifyFile — disputed cases (priority order)', () => {
  it('a snapshot file inside __tests__/ is boilerplate — the snapshot rule outranks tests', () => {
    expect(classifyFile('__tests__/__snapshots__/x.snap')).toBe('boilerplate');
  });

  it('a .claude/ skill doc is wiring — .claude/** outranks the *.md docs rule', () => {
    expect(classifyFile('.claude/skills/security/SKILL.md')).toBe('wiring');
  });

  it('e2e/README.md is tests — a deliberate call that e2e/** outranks docs', () => {
    expect(classifyFile('e2e/README.md')).toBe('tests');
  });
});

describe('SMART_DIFF_ROLE_ORDER', () => {
  it('is the fixed display order: core, tests, wiring, docs, boilerplate', () => {
    expect(SMART_DIFF_ROLE_ORDER).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
  });
});
