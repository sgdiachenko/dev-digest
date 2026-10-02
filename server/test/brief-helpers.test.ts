/**
 * PR Brief pure helpers (modules/brief/helpers.ts): ranges, blast projection,
 * output validation, stored document, failure classification.
 */
import { describe, it, expect } from 'vitest';
import { PrBriefRecord, type BlastRadiusResponse } from '@devdigest/shared';
import { TimeoutError } from '../src/platform/resilience.js';
import {
  StoredBrief,
  addedLineRanges,
  blastMissingReason,
  blastPathsOf,
  classifyBriefFailure,
  InvalidBriefOutputError,
  parseStoredBrief,
  pickLinkedIssueNumber,
  projectBlast,
  specsMissingReason,
  toBriefRecord,
  truncateText,
  validateBriefOutput,
  type RawBriefOutput,
  type ValidationContext,
} from '../src/modules/brief/helpers.js';

const PATCH = [
  '@@ -1,4 +1,6 @@',
  ' keep',
  '+added a',
  '+added b',
  '-removed',
  ' keep2',
  '+added c',
  ' tail',
  '@@ -20,2 +30,3 @@',
  ' ctx',
  '+added d',
  ' ctx2',
].join('\n');

describe('addedLineRanges', () => {
  it('returns only added new-side ranges, contiguous across deleted lines', () => {
    // new side: 1 keep, 2 added a, 3 added b, 4 keep2, 5 added c, 6 tail; then 30 ctx, 31 added d
    expect(addedLineRanges(PATCH)).toEqual([
      { start: 2, end: 3 },
      { start: 5, end: 5 },
      { start: 31, end: 31 },
    ]);
  });

  it('is empty for null, empty, deletions-only and binary-like patches', () => {
    expect(addedLineRanges(null)).toEqual([]);
    expect(addedLineRanges('')).toEqual([]);
    expect(addedLineRanges('@@ -1,2 +1,1 @@\n keep\n-gone')).toEqual([]);
    expect(addedLineRanges('Binary files differ')).toEqual([]);
  });
});

describe('pickLinkedIssueNumber', () => {
  const repo = { owner: 'acme', name: 'api' };
  it('picks the first same-repo reference', () => {
    expect(pickLinkedIssueNumber({ title: 'Fix', body: 'Closes #12 and #13', branch: 'f' }, repo)).toBe(12);
  });
  it('ignores cross-repo references and returns null when there is none', () => {
    expect(pickLinkedIssueNumber({ title: 'Fix', body: 'see other/x#9', branch: 'f' }, repo)).toBeNull();
    expect(pickLinkedIssueNumber({ title: 'Fix', body: null, branch: 'f' }, repo)).toBeNull();
  });
});

const blastResponse = (): BlastRadiusResponse => ({
  summary: 's'.repeat(1500),
  changed_symbols: [
    { name: 'foo', file: 'src/a.ts', kind: 'function' },
    { name: 'bar', file: 'src/b.ts', kind: 'class' },
  ],
  downstream: [
    {
      symbol: 'foo',
      callers: [{ name: 'use', file: 'src/c.ts', line: 7, endpoints_affected: ['GET /x'], crons_affected: ['nightly'] }],
      endpoints_affected: ['GET /x'],
      crons_affected: ['nightly'],
    },
  ],
  degraded: false,
  reason: null,
});

describe('projectBlast / blastPathsOf', () => {
  it('caps the summary, empties endpoint and cron lists, drops the degraded fields', () => {
    const p = projectBlast(blastResponse());
    expect(p.summary.length).toBe(1000);
    expect(p.summary.endsWith('…')).toBe(true);
    expect(p.downstream[0]!.endpoints_affected).toEqual([]);
    expect(p.downstream[0]!.crons_affected).toEqual([]);
    expect(p.downstream[0]!.callers[0]).toEqual({
      name: 'use',
      file: 'src/c.ts',
      line: 7,
      endpoints_affected: [],
      crons_affected: [],
    });
    expect('degraded' in p).toBe(false);
  });

  it('blastPathsOf lists exactly the files present in the projection', () => {
    const p = projectBlast(blastResponse());
    expect([...blastPathsOf(p)].sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    const trimmed = { ...p, changed_symbols: [p.changed_symbols[0]!], downstream: [] };
    expect([...blastPathsOf(trimmed)]).toEqual(['src/a.ts']);
    expect(blastPathsOf(null).size).toBe(0);
  });
});

describe('missing-reason mapping', () => {
  it('maps blast outcomes', () => {
    expect(blastMissingReason({ kind: 'ok', degraded: false, reason: null })).toBeNull();
    expect(blastMissingReason({ kind: 'ok', degraded: true, reason: 'index_partial' })).toBe('index_partial');
    expect(blastMissingReason({ kind: 'ok', degraded: true, reason: null })).toBe('no_data');
    expect(blastMissingReason({ kind: 'timeout' })).toBe('timeout');
    expect(blastMissingReason({ kind: 'error' })).toBe('unavailable');
  });

  it('maps specs results with the reason priority already applied upstream', () => {
    expect(specsMissingReason({ kind: 'none' })).toBe('none_attached');
    expect(specsMissingReason({ kind: 'unavailable', reason: 'no_clone' })).toBe('not_cloned');
    expect(specsMissingReason({ kind: 'unavailable', reason: 'no_catalog' })).toBe('no_catalog');
    expect(specsMissingReason({ kind: 'unavailable', reason: 'timeout' })).toBe('unavailable');
    expect(specsMissingReason({ kind: 'unavailable', reason: 'error' })).toBe('unavailable');
    expect(specsMissingReason({ kind: 'resolved', sha: 'a', docs: [] })).toBe('none_attached');
    expect(
      specsMissingReason({ kind: 'resolved', sha: 'a', docs: [{ path: 'd.md', text: 't', estTokens: 1 }] }),
    ).toBeNull();
  });
});

const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  prPaths: new Set(['src/a.ts', 'src/nopatch.bin']),
  blastPaths: new Set(['src/caller.ts']),
  rangesByPath: new Map([['src/a.ts', [{ start: 10, end: 12 }, { start: 40, end: 40 }]]]),
  ...over,
});

const risk = (over: Partial<RawBriefOutput['risks'][number]> = {}): RawBriefOutput['risks'][number] => ({
  kind: 'security',
  title: 't',
  explanation: 'e',
  severity: 'medium',
  file_refs: ['src/a.ts'],
  ...over,
});

const out = (over: Partial<RawBriefOutput> = {}): RawBriefOutput => ({
  summary: 'sum',
  risks: [],
  review_focus: [],
  ...over,
});

describe('validateBriefOutput — risks', () => {
  it('removes refs outside PR ∪ blast (including path-only part of :line / :a-b), drops ref-less risks', () => {
    const v = validateBriefOutput(
      out({
        risks: [
          risk({ file_refs: ['src/a.ts:11', 'src/caller.ts:3-9', 'src/ghost.ts:1', 'old/renamed.ts'] }),
          risk({ title: 'gone', file_refs: ['src/ghost.ts'] }),
        ],
      }),
      ctx(),
    );
    expect(v.risks).toHaveLength(1);
    expect(v.risks[0]!.file_refs).toEqual(['src/a.ts:11', 'src/caller.ts:3-9']);
    expect(v.dropped).toEqual({ refs: 3, risks: 1, focus: 0 });
  });

  it('coerces an unknown kind to other and keeps known ones', () => {
    const v = validateBriefOutput(out({ risks: [risk({ kind: 'licensing' }), risk({ kind: 'perf' })] }), ctx());
    expect(v.risks.map((r) => r.kind)).toEqual(['other', 'perf']);
  });

  it('sorts by severity keeping model order inside a severity, caps at 6 risks and 3 refs', () => {
    const risks = [
      risk({ title: 'm1', severity: 'medium' }),
      risk({ title: 'l1', severity: 'low' }),
      risk({ title: 'h1', severity: 'high', file_refs: ['src/a.ts:1', 'src/a.ts:2', 'src/a.ts:3', 'src/a.ts:4'] }),
      risk({ title: 'm2', severity: 'medium' }),
      risk({ title: 'h2', severity: 'high' }),
      risk({ title: 'l2', severity: 'low' }),
      risk({ title: 'm3', severity: 'medium' }),
    ];
    const v = validateBriefOutput(out({ risks }), ctx());
    expect(v.risks.map((r) => r.title)).toEqual(['h1', 'h2', 'm1', 'm2', 'm3', 'l1']);
    expect(v.risks[0]!.file_refs).toHaveLength(3);
  });

  it('truncates with an ellipsis: summary 600, title 80, explanation 600', () => {
    const v = validateBriefOutput(
      out({ summary: 'x'.repeat(700), risks: [risk({ title: 'y'.repeat(100), explanation: 'z'.repeat(700) })] }),
      ctx(),
    );
    expect(v.summary).toHaveLength(600);
    expect(v.summary.endsWith('…')).toBe(true);
    expect(v.risks[0]!.title).toHaveLength(80);
    expect(v.risks[0]!.explanation).toHaveLength(600);
    expect(truncateText('short', 10)).toBe('short');
  });

  it('still returns the summary when nothing survives', () => {
    const v = validateBriefOutput(
      out({ summary: 'only this', risks: [risk({ file_refs: ['nope.ts'] })], review_focus: [{ file: 'nope.ts', line: 1, reason: 'r' }] }),
      ctx(),
    );
    expect(v).toMatchObject({ summary: 'only this', risks: [], review_focus: [] });
  });

  it('is not fooled by prototype-ish paths', () => {
    const v = validateBriefOutput(
      out({ risks: [risk({ file_refs: ['__proto__', 'constructor'] })], review_focus: [{ file: '__proto__', line: 1, reason: 'r' }] }),
      ctx(),
    );
    expect(v.risks).toEqual([]);
    expect(v.review_focus).toEqual([]);
  });
});

describe('validateBriefOutput — review focus', () => {
  const focus = (file: string, line: number, reason = 'r') => ({ file, line, reason });

  it('drops items whose file is not a PR file (blast files do not count)', () => {
    const v = validateBriefOutput(out({ review_focus: [focus('src/caller.ts', 3), focus('src/a.ts', 11)] }), ctx());
    expect(v.review_focus.map((f) => f.file)).toEqual(['src/a.ts']);
  });

  it('keeps a line inside a range, snaps one outside to the first added line, both verified', () => {
    const v = validateBriefOutput(
      out({ review_focus: [focus('src/a.ts', 12), focus('src/a.ts', 25), focus('src/a.ts', 999)] }),
      ctx(),
    );
    // 25 and 999 both snap to 10 -> deduped
    expect(v.review_focus).toEqual([
      { file: 'src/a.ts', line: 12, reason: 'r', line_verified: true },
      { file: 'src/a.ts', line: 10, reason: 'r', line_verified: true },
    ]);
  });

  it('snaps line 0 and negative lines to the first added line for a file with a patch', () => {
    const v = validateBriefOutput(out({ review_focus: [focus('src/a.ts', 0)] }), ctx());
    expect(v.review_focus[0]).toMatchObject({ line: 10, line_verified: true });
  });

  it('file without ranges: line >= 1 stays unverified; line 0 / -5 become 1 and the result passes StoredBrief', () => {
    const v = validateBriefOutput(
      out({
        review_focus: [focus('src/nopatch.bin', 42), focus('src/nopatch.bin', 0), focus('src/nopatch.bin', -5)],
      }),
      ctx(),
    );
    expect(v.review_focus).toEqual([
      { file: 'src/nopatch.bin', line: 42, reason: 'r', line_verified: false },
      { file: 'src/nopatch.bin', line: 1, reason: 'r', line_verified: false },
    ]);
    const stored = StoredBrief.safeParse(storedDoc({ review_focus: v.review_focus }));
    expect(stored.success).toBe(true);
  });

  it('dedups file:line, truncates reasons to 160 and caps at 8 items', () => {
    const items = Array.from({ length: 12 }, (_, i) => focus('src/nopatch.bin', i + 1, 'q'.repeat(200)));
    const v = validateBriefOutput(out({ review_focus: [focus('src/nopatch.bin', 1), ...items] }), ctx());
    expect(v.review_focus).toHaveLength(8);
    expect(v.review_focus[0]!.reason).toBe('r');
    expect(v.review_focus[1]!.reason).toHaveLength(160);
    expect(new Set(v.review_focus.map((f) => f.line)).size).toBe(8);
  });
});

function storedDoc(over: Record<string, unknown> = {}) {
  return {
    summary: 's',
    review_focus: [],
    intent: null,
    blast: null,
    risks: { risks: [] },
    history: null,
    head_sha: 'abc',
    generated_at: '2026-10-02T00:00:00.000Z',
    provider: 'openai',
    model: 'm',
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    input_tokens_est: 10,
    missing_inputs: [],
    specs_sha: null,
    specs_used: [],
    schema_version: 1,
    ...over,
  };
}

describe('stored document', () => {
  it('parses a current document and reads anything else as null', () => {
    expect(parseStoredBrief(storedDoc())).not.toBeNull();
    expect(parseStoredBrief(storedDoc({ schema_version: 2 }))).toBeNull();
    expect(parseStoredBrief({ junk: true })).toBeNull();
    expect(parseStoredBrief('{not json')).toBeNull();
    expect(parseStoredBrief(null)).toBeNull();
  });

  it('toBriefRecord adds pr_id and stale, and yields a valid wire record', () => {
    const stored = parseStoredBrief(storedDoc())!;
    const fresh = toBriefRecord('pr1', stored, 'abc');
    const stale = toBriefRecord('pr1', stored, 'def');
    expect(fresh.stale).toBe(false);
    expect(stale.stale).toBe(true);
    expect('schema_version' in fresh).toBe(false);
    expect(PrBriefRecord.safeParse(fresh).success).toBe(true);
  });
});

describe('classifyBriefFailure', () => {
  it('classifies timeouts, invalid output and everything else', () => {
    expect(classifyBriefFailure(new TimeoutError(5))).toBe('llm_timeout');
    expect(classifyBriefFailure(Object.assign(new Error('x'), { name: 'APIConnectionTimeoutError' }))).toBe('llm_timeout');
    expect(classifyBriefFailure(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe('llm_timeout');
    expect(classifyBriefFailure(new InvalidBriefOutputError('empty'))).toBe('invalid_output');
    expect(classifyBriefFailure(new SyntaxError('bad json'))).toBe('invalid_output');
    expect(classifyBriefFailure(new Error('fixture failed schema validation'))).toBe('invalid_output');
    expect(classifyBriefFailure(new Error('429 quota exceeded'))).toBe('llm_error');
    expect(classifyBriefFailure('weird')).toBe('llm_error');
  });
});
