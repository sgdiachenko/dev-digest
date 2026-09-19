import { describe, it, expect } from 'vitest';
import { lineDiff } from '../src/modules/skills/helpers.js';

/** The Versions tab's Diff modal — a pure line-level LCS diff. */
describe('lineDiff', () => {
  it('returns all context for identical bodies', () => {
    const body = 'line 1\nline 2\nline 3';
    const out = lineDiff(body, body);
    expect(out.every((l) => l.kind === 'ctx')).toBe(true);
    expect(out.map((l) => l.text)).toEqual(['line 1', 'line 2', 'line 3']);
  });

  it('marks an appended line as an add, keeping earlier lines as context', () => {
    const out = lineDiff('# Rule\nOne.', '# Rule\nOne.\nTwo.');
    expect(out).toEqual([
      { kind: 'ctx', text: '# Rule' },
      { kind: 'ctx', text: 'One.' },
      { kind: 'add', text: 'Two.' },
    ]);
  });

  it('marks a removed line as a del', () => {
    const out = lineDiff('# Rule\nOne.\nTwo.', '# Rule\nOne.');
    expect(out).toEqual([
      { kind: 'ctx', text: '# Rule' },
      { kind: 'ctx', text: 'One.' },
      { kind: 'del', text: 'Two.' },
    ]);
  });

  it('handles a reordered body as a del+add pair, not silent context', () => {
    const out = lineDiff('A\nB', 'B\nA');
    expect(out.some((l) => l.kind === 'del')).toBe(true);
    expect(out.some((l) => l.kind === 'add')).toBe(true);
  });

  it('diffs an empty body against a non-empty one as all adds', () => {
    const out = lineDiff('', 'New rule.');
    expect(out.filter((l) => l.kind === 'add').map((l) => l.text)).toContain('New rule.');
  });
});
