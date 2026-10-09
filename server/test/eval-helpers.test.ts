import { describe, it, expect } from 'vitest';
import type { EvalCaseResult, EvalSuiteRun, Finding } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import {
  caseTypeFor,
  compareRuns,
  cutFragment,
  diffFromTrace,
  draftName,
  expectationFromFinding,
  hasMetrics,
  orderRuns,
} from '../src/modules/eval/helpers.js';

const RAW = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 one
+two
 three
 four
@@ -50,3 +51,4 @@
 fifty
+fifty-one
 x
 y
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -5,2 +5,3 @@
 b5
+b6
 b7
`;
const DIFF = parseUnifiedDiff(RAW);

describe('draft helpers', () => {
  it('draftName: prefix + kebab slug, capped at 120 (AC-8)', () => {
    expect(draftName('must_find', 'Hardcoded Stripe secret key!')).toBe('must-find-hardcoded-stripe-secret-key');
    expect(draftName('must_not_flag', 'Hardcoded Stripe secret key')).toBe('no-hardcoded-stripe-secret-key');
    const long = draftName('must_find', 'word '.repeat(100));
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('-')).toBe(false);
    expect(draftName('must_find', '!!!')).toBe('must-find-finding');
  });

  it('caseTypeFor: accepted -> must_find, dismissed -> must_not_flag, open -> null (AC-6, EC-2)', () => {
    expect(caseTypeFor({ accepted_at: 'x', dismissed_at: null })).toBe('must_find');
    expect(caseTypeFor({ accepted_at: null, dismissed_at: 'x' })).toBe('must_not_flag');
    expect(caseTypeFor({ accepted_at: null, dismissed_at: null })).toBeNull();
  });

  it('expectationFromFinding keeps file, range and informational fields (AC-7)', () => {
    const f = {
      file: 'a.ts',
      start_line: 3,
      end_line: 5,
      severity: 'CRITICAL',
      category: 'security',
      title: 'T',
    } as Finding;
    expect(expectationFromFinding(f)).toEqual({
      file: 'a.ts',
      start_line: 3,
      end_line: 5,
      severity: 'CRITICAL',
      category: 'security',
      title: 'T',
    });
  });

  it('diffFromTrace returns the diff from prompt_assembly.user, round-trip safe (AC-11)', () => {
    const user = `## Diff to review\n${wrapUntrusted('diff', RAW)}\n`;
    expect(diffFromTrace({ prompt_assembly: { user } })).toBe(RAW);
  });

  it('diffFromTrace is null without a diff (AC-12)', () => {
    expect(diffFromTrace({ prompt_assembly: { user: 'no diff here' } })).toBeNull();
    expect(diffFromTrace({ prompt_assembly: null })).toBeNull();
    expect(diffFromTrace(null)).toBeNull();
  });
});

describe('cutFragment', () => {
  it('keeps the file header and only intersecting hunks, new-side numbers intact (AC-9)', () => {
    const frag = cutFragment(DIFF, 'src/a.ts', 51, 52)!;
    expect(frag).toContain('diff --git a/src/a.ts b/src/a.ts');
    expect(frag).toContain('--- a/src/a.ts');
    expect(frag).toContain('+++ b/src/a.ts');
    expect(frag).toContain('@@ -50,3 +51,4 @@');
    expect(frag).not.toContain('@@ -1,3 +1,4 @@');
    expect(frag).not.toContain('src/b.ts');
    const reparsed = parseUnifiedDiff(frag);
    expect(reparsed.files).toHaveLength(1);
    expect(reparsed.files[0]!.hunks[0]!.newStart).toBe(51);
  });

  it('full-file kinds get every hunk of the file (AC-10)', () => {
    const frag = cutFragment(DIFF, 'src/a.ts', 999, 999, 'secret_leak')!;
    expect(frag).toContain('@@ -1,3 +1,4 @@');
    expect(frag).toContain('@@ -50,3 +51,4 @@');
  });

  it('null when nothing intersects or the file is absent (AC-14)', () => {
    expect(cutFragment(DIFF, 'src/a.ts', 20, 30)).toBeNull();
    expect(cutFragment(DIFF, 'src/missing.ts', 1, 5)).toBeNull();
  });
});

function caseRes(id: string, status: EvalCaseResult['status']): EvalCaseResult {
  return {
    case_id: id,
    case_name: `case-${id}`,
    status,
    error_reason: null,
    actual_findings: [],
    dropped_findings: [],
    expected_count: 1,
    actual_count: 0,
    duration_ms: null,
    cost_usd: null,
  };
}
function run(
  started_at: string,
  results: Array<[string, EvalCaseResult['status']]>,
  over: Partial<Pick<EvalSuiteRun, 'config'>> = {},
): Pick<EvalSuiteRun, 'started_at' | 'case_ids' | 'config' | 'per_case'> {
  return {
    started_at,
    case_ids: results.map(([id]) => id),
    per_case: results.map(([id, s]) => caseRes(id, s)),
    config: {
      provider: 'openrouter',
      model: 'm',
      strategy: 'single-pass',
      system_prompt: 'p',
      skills: [{ id: 's1', version: 1 }],
      temperature: 0,
    },
    ...over,
  };
}

describe('run comparison', () => {
  it('orderRuns puts the older run first (AC-125)', () => {
    const older = run('2026-10-01T00:00:00Z', []);
    const newer = run('2026-10-02T00:00:00Z', []);
    expect(orderRuns(newer, older)).toEqual([older, newer]);
    expect(orderRuns(older, newer)).toEqual([older, newer]);
  });

  it('hasMetrics only for completed and partial', () => {
    expect(hasMetrics('completed')).toBe(true);
    expect(hasMetrics('partial')).toBe(true);
    for (const s of ['queued', 'running', 'failed', 'cancelled', 'interrupted'] as const) {
      expect(hasMetrics(s)).toBe(false);
    }
  });

  it('reports added/removed cases, flips and absent outcomes (AC-127, AC-165, EC-20)', () => {
    const a = run('2026-10-01T00:00:00Z', [
      ['c1', 'pass'],
      ['c2', 'fail'],
      ['c3', 'pass'],
    ]);
    const b = run('2026-10-02T00:00:00Z', [
      ['c1', 'fail'],
      ['c2', 'pass'],
      ['c4', 'pass'],
    ]);
    const r = compareRuns(a, b);
    expect(r.case_set).toEqual({ added: ['c4'], removed: ['c3'] });
    const by = Object.fromEntries(r.flips.map((f) => [f.case_id, f]));
    expect(by.c1).toMatchObject({ a: 'pass', b: 'fail', flip: 'pass_to_fail' });
    expect(by.c2).toMatchObject({ a: 'fail', b: 'pass', flip: 'fail_to_pass' });
    expect(by.c3).toMatchObject({ a: 'pass', b: 'absent', flip: 'none' });
    expect(by.c4).toMatchObject({ a: 'absent', b: 'pass', flip: 'none' });
  });

  it('identical_config reflects config and skill versions (AC-125, EC-21)', () => {
    const a = run('2026-10-01T00:00:00Z', [['c1', 'pass']]);
    const same = run('2026-10-02T00:00:00Z', [['c1', 'pass']]);
    expect(compareRuns(a, same).identical_config).toBe(true);
    const diff = run('2026-10-02T00:00:00Z', [['c1', 'pass']], {
      config: { ...same.config, skills: [{ id: 's1', version: 2 }] },
    });
    expect(compareRuns(a, diff).identical_config).toBe(false);
    const model = run('2026-10-02T00:00:00Z', [['c1', 'pass']], { config: { ...same.config, model: 'm2' } });
    expect(compareRuns(a, model).identical_config).toBe(false);
  });
});
