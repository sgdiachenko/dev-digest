import { describe, it, expect } from 'vitest';
import { PrBriefRecord, ReviewFocusItem, BriefMissingInput } from '@devdigest/shared';

const record = {
  summary: 'Adds a brief.',
  review_focus: [{ file: 'a.ts', line: 3, reason: 'core change', line_verified: true }],
  intent: { intent: 'x', in_scope: [], out_of_scope: [] },
  blast: { changed_symbols: [], downstream: [], summary: '' },
  risks: { risks: [] },
  history: null,
  pr_id: 'pr1',
  head_sha: 'abc1234',
  stale: false,
  generated_at: '2026-10-02T00:00:00.000Z',
  provider: 'openai',
  model: 'gpt-4.1',
  tokens_in: 10,
  tokens_out: 5,
  cost_usd: null,
  input_tokens_est: 100,
  missing_inputs: [{ input: 'specs', reason: 'none_attached' }],
  specs_sha: null,
  specs_used: [{ path: 'docs/a.md', est_tokens: 12 }],
};

describe('PrBriefRecord contract', () => {
  it('accepts a valid record', () => {
    expect(PrBriefRecord.safeParse(record).success).toBe(true);
  });

  it('accepts null intent, blast and history', () => {
    expect(PrBriefRecord.safeParse({ ...record, intent: null, blast: null, history: null }).success).toBe(true);
  });

  it.each([0, -1])('rejects focus line %i', (line) => {
    expect(ReviewFocusItem.safeParse({ ...record.review_focus[0], line }).success).toBe(false);
    expect(PrBriefRecord.safeParse({ ...record, review_focus: [{ ...record.review_focus[0], line }] }).success).toBe(false);
  });

  it('rejects an unknown missing-input reason', () => {
    expect(BriefMissingInput.safeParse({ input: 'specs', reason: 'bogus' }).success).toBe(false);
  });

  it('rejects a record without summary', () => {
    const { summary: _s, ...rest } = record;
    expect(PrBriefRecord.safeParse(rest).success).toBe(false);
  });
});
