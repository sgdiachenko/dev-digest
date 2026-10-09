import { describe, it, expect } from 'vitest';
import { EvalCaseInput, EvalExpectation, hunkRangesByFile } from '@devdigest/shared';

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +10,5 @@',
  ' ctx',
  '+added',
  ' ctx',
].join('\n');

const exp = (over: Record<string, unknown> = {}) => ({
  file: 'src/a.ts',
  start_line: 11,
  end_line: 12,
  severity: null,
  category: null,
  title: null,
  ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  name: 'must-find-x',
  type: 'must_find',
  input_diff: DIFF,
  input_meta: { pr_title: 't', pr_body: null, pr_number: 1, repo_full_name: null },
  expectations: [exp()],
  diff_source: 'run_trace',
  ...over,
});

const pathsOf = (r: ReturnType<typeof EvalCaseInput.safeParse>) =>
  r.success ? [] : r.error.issues.map((i) => i.path.join('.'));

describe('EvalExpectation (AC-7)', () => {
  it('carries file and range; severity/category/title may be null', () => {
    expect(EvalExpectation.safeParse(exp()).success).toBe(true);
    expect(
      EvalExpectation.parse(exp({ severity: 'WARNING', category: 'bug', title: 'T' })).severity,
    ).toBe('WARNING');
  });
  it('rejects an unknown key (strict)', () => {
    expect(EvalExpectation.safeParse(exp({ extra: 1 })).success).toBe(false);
  });
});

describe('EvalCaseInput', () => {
  it('accepts a valid case and source_finding_id (AC-140)', () => {
    const r = EvalCaseInput.safeParse(input({ source_finding_id: 'f-1' }));
    expect(r.success).toBe(true);
    expect(r.success && r.data.source_finding_id).toBe('f-1');
    const d = EvalCaseInput.parse(input());
    expect(d.source_finding_id).toBeNull();
    expect(d.notes).toBeNull();
  });

  it('rejects an empty expectation list (AC-145)', () => {
    expect(pathsOf(EvalCaseInput.safeParse(input({ expectations: [] })))).toContain('expectations');
  });

  it('rejects end_line below start_line at the field (AC-52/145)', () => {
    const r = EvalCaseInput.safeParse(input({ expectations: [exp({ start_line: 12, end_line: 11 })] }));
    expect(pathsOf(r)).toEqual(['expectations.0.end_line']);
  });

  it('rejects a file absent from the fragment (EC-6)', () => {
    const r = EvalCaseInput.safeParse(input({ expectations: [exp({ file: 'other.ts' })] }));
    expect(pathsOf(r)).toEqual(['expectations.0.file']);
  });

  it('rejects lines outside every hunk (EC-7), accepts a partial overlap', () => {
    const out = EvalCaseInput.safeParse(input({ expectations: [exp({ start_line: 40, end_line: 41 })] }));
    expect(pathsOf(out)).toEqual(['expectations.0.start_line']);
    // hunk covers new-side 10..14; a range straddling its edge still intersects
    expect(
      EvalCaseInput.safeParse(input({ expectations: [exp({ start_line: 14, end_line: 20 })] })).success,
    ).toBe(true);
  });

  it('reports the failing expectation index', () => {
    const r = EvalCaseInput.safeParse(input({ expectations: [exp(), exp({ file: 'nope.ts' })] }));
    expect(pathsOf(r)).toEqual(['expectations.1.file']);
  });

  it('enforces the limits (NFR-3, EC-26)', () => {
    expect(EvalCaseInput.safeParse(input({ name: 'a'.repeat(120) })).success).toBe(true);
    expect(pathsOf(EvalCaseInput.safeParse(input({ name: 'a'.repeat(121) })))).toContain('name');
    const big = DIFF + '\n' + 'x'.repeat(65_536 - DIFF.length - 1);
    expect(new TextEncoder().encode(big).length).toBe(65_536);
    expect(EvalCaseInput.safeParse(input({ input_diff: big })).success).toBe(true);
    expect(pathsOf(EvalCaseInput.safeParse(input({ input_diff: big + 'x' })))).toContain('input_diff');
    const many = Array.from({ length: 21 }, () => exp());
    expect(pathsOf(EvalCaseInput.safeParse(input({ expectations: many })))).toContain('expectations');
  });

  it('counts diff size in bytes, not characters', () => {
    const multi = '€'.repeat(21_846); // 3 bytes each = 65_538
    expect(pathsOf(EvalCaseInput.safeParse(input({ input_diff: multi })))).toContain('input_diff');
  });

  it('no longer accepts an owner in the body (stripped)', () => {
    const r = EvalCaseInput.parse(input({ owner_kind: 'agent', owner_id: 'a1' }));
    expect(r).not.toHaveProperty('owner_id');
  });
});

describe('hunkRangesByFile', () => {
  it('parses new-side ranges per file and skips deletions', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,3 @@',
      '@@ -20 +30 @@',
      'diff --git a/gone.ts b/gone.ts',
      '--- a/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      'diff --git a/b.ts b/b.ts',
      '--- a/b.ts',
      '+++ b/b.ts',
      '@@ -5,1 +7,0 @@',
    ].join('\n');
    const m = hunkRangesByFile(diff);
    expect(m.get('a.ts')).toEqual([
      { start: 1, end: 3 },
      { start: 30, end: 30 },
    ]);
    expect(m.get('gone.ts')).toEqual([]);
    expect(m.get('b.ts')).toEqual([]);
  });
});
