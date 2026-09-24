/**
 * `buildSmartDiff` — pure grouping/aggregation, unit-tested. No DB, no HTTP.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSmartDiff,
  type SmartDiffFileInput,
  type SmartDiffFindingInput,
} from '../src/modules/smart-diff/helpers.js';

function file(o: Partial<SmartDiffFileInput> = {}): SmartDiffFileInput {
  return { path: 'src/config.ts', additions: 4, deletions: 1, ...o };
}

function finding(o: Partial<SmartDiffFindingInput> = {}): SmartDiffFindingInput {
  return { id: 'f1', file: 'src/config.ts', startLine: 11, dismissedAt: null, ...o };
}

describe('buildSmartDiff', () => {
  it('groups files into the fixed role order and omits empty groups', () => {
    const files = [
      file({ path: 'src/service.ts' }),
      file({ path: 'src/service.test.ts' }),
      file({ path: 'README.md' }),
    ];
    const d = buildSmartDiff(files, []);
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs']);
    // wiring/boilerplate had no files — never emitted, even as an empty group.
    expect(d.groups.some((g) => g.role === 'wiring' || g.role === 'boilerplate')).toBe(false);
  });

  it('drops dismissed findings from finding_ids/finding_lines, keeps the rest', () => {
    const files = [file({ path: 'src/config.ts' })];
    const findings = [
      finding({ id: 'kept', startLine: 11, dismissedAt: null }),
      finding({ id: 'kept-too', startLine: 20, dismissedAt: null }),
      finding({ id: 'gone', startLine: 30, dismissedAt: new Date() }),
    ];
    const d = buildSmartDiff(files, findings);
    const f = d.groups[0]!.files[0]!;
    expect(f.finding_ids).toEqual(['kept', 'kept-too']);
    expect(f.finding_lines).toEqual([11, 20]);
  });

  it('finding_ids are sorted by start_line; finding_lines are unique & ascending', () => {
    const files = [file({ path: 'src/config.ts' })];
    const findings = [
      finding({ id: 'later', startLine: 40 }),
      finding({ id: 'earlier', startLine: 10 }),
      finding({ id: 'dup-line', startLine: 10 }),
    ];
    const d = buildSmartDiff(files, findings);
    const f = d.groups[0]!.files[0]!;
    expect(f.finding_ids).toEqual(['earlier', 'dup-line', 'later']);
    expect(f.finding_lines).toEqual([10, 40]);
  });

  it('a file with no findings gets empty finding_ids/finding_lines, not an error', () => {
    const d = buildSmartDiff([file({ path: 'src/untouched.ts' })], []);
    const f = d.groups[0]!.files[0]!;
    expect(f.finding_ids).toEqual([]);
    expect(f.finding_lines).toEqual([]);
  });

  it('total_lines sums additions+deletions across every file, independent of grouping', () => {
    const files = [
      file({ path: 'src/a.ts', additions: 10, deletions: 2 }),
      file({ path: 'src/a.test.ts', additions: 5, deletions: 0 }),
    ];
    const d = buildSmartDiff(files, []);
    expect(d.split_suggestion.total_lines).toBe(17);
    expect(d.split_suggestion.too_big).toBe(false);
    expect(d.split_suggestion.proposed_splits).toEqual([]);
  });

  it('no files at all → no groups, total_lines 0', () => {
    const d = buildSmartDiff([], []);
    expect(d.groups).toEqual([]);
    expect(d.split_suggestion.total_lines).toBe(0);
  });
});
