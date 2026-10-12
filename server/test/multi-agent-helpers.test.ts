import { describe, it, expect } from 'vitest';
import {
  buildMultiAgentRun,
  groupFindings,
  isConflict,
  takesFor,
  type GroupableFinding,
  type GroupMember,
  type GroupReview,
} from '../src/modules/reviews/helpers.js';
import type { AgentColumn, ConflictTake, FindingGroup } from '@devdigest/shared';
import type { FindingRow } from '../src/db/rows.js';

/** Pure grouping / takes / aggregates behind GET /pulls/:id/multi-agent (no DB). */

const gf = (id: string, runId: string, start: number, end: number | null, file = 'a.ts'): GroupableFinding => ({
  id,
  runId,
  file,
  startLine: start,
  endLine: end,
});

const shuffle = <T>(xs: T[], seed: number): T[] => {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

describe('groupFindings (AC-15, AC-16, EC-6, EC-14)', () => {
  it('joins only overlapping same-file findings of different runs; missing end_line = start_line', () => {
    const groups = groupFindings([
      gf('f1', 'r1', 10, 12),
      gf('f2', 'r2', 12, null), // touches line 12 -> overlaps
      gf('f3', 'r3', 13, 14), // outside the anchor
      gf('f4', 'r2', 11, 11, 'other.ts'), // other file
      gf('f5', 'r1', 11, 11), // overlaps anchor but r1 already in the group
    ]);
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    expect(byId.f1!.finding_ids).toEqual(['f1', 'f2']);
    expect(byId.f1!.run_ids).toEqual(['r1', 'r2']);
    expect(byId.f1).toMatchObject({ file: 'a.ts', start_line: 10, end_line: 12 });
    expect(Object.keys(byId).sort()).toEqual(['f1', 'f3', 'f4', 'f5']);
  });

  it('gives identical groups and ids for any input order', () => {
    const input = [
      gf('b', 'r2', 5, 9),
      gf('a', 'r1', 5, 7),
      gf('c', 'r3', 8, 9),
      gf('d', 'r1', 20, 20),
      gf('e', 'r2', 20, null),
    ];
    const expected = groupFindings(input);
    for (let seed = 1; seed <= 8; seed++) expect(groupFindings(shuffle(input, seed))).toEqual(expected);
  });

  it('chains a/b/c into {A,B} and {C} (overlap is judged against the anchor only)', () => {
    const groups = groupFindings([gf('A', 'r1', 1, 5), gf('B', 'r2', 5, 9), gf('C', 'r3', 8, 12)]);
    expect(groups.map((g) => g.finding_ids)).toEqual([['A', 'B'], ['C']]);
    expect(groups[0]).toMatchObject({ id: 'A', start_line: 1, end_line: 9 });
  });
});

const col = (over: Partial<AgentColumn> & Pick<AgentColumn, 'run_id'>): AgentColumn => ({
  agent_id: over.run_id,
  agent_name: over.run_id.toUpperCase(),
  provider: null,
  model: null,
  status: 'done',
  error: null,
  verdict: null,
  score: null,
  summary: null,
  duration_ms: null,
  cost_usd: null,
  findings: [],
  ...over,
});
const cf = (id: string, severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION') => ({
  id,
  severity,
  category: 'bug',
  title: id,
  file: 'a.ts',
  start_line: 1,
  end_line: 1,
});
const grp = (ids: string[]): FindingGroup => ({
  id: ids[0]!,
  file: 'a.ts',
  start_line: 1,
  end_line: 1,
  finding_ids: ids,
  run_ids: [],
});

describe('takesFor / isConflict (AC-18, AC-19, EC-5, EC-7)', () => {
  const columns = [
    col({ run_id: 'r1', findings: [cf('f1', 'WARNING'), cf('f1b', 'CRITICAL')] }),
    col({ run_id: 'r2' }), // done, did not flag
    col({ run_id: 'r3', status: 'failed' }),
    col({ run_id: 'r4', status: 'running' }),
    col({ run_id: 'r5', status: 'cancelled' }),
  ];

  it('takes the highest severity when flagged, ignored for done, no_result otherwise', () => {
    const takes = takesFor(grp(['f1', 'f1b']), columns);
    expect(takes.map((t) => [t.run_id, t.verdict])).toEqual([
      ['r1', 'CRITICAL'],
      ['r2', 'ignored'],
      ['r3', 'no_result'],
      ['r4', 'no_result'],
      ['r5', 'no_result'],
    ]);
    expect(takes.every((t) => t.note === '')).toBe(true);
  });

  it('a done run with zero findings is ignored in every group (EC-5)', () => {
    const takes = takesFor(grp(['zzz']), [col({ run_id: 'r1' })]);
    expect(takes[0]!.verdict).toBe('ignored');
  });

  const take = (verdict: ConflictTake['verdict']): ConflictTake => ({
    run_id: 'x',
    agent_id: 'x',
    persona: 'x',
    verdict,
    note: '',
  });

  it('conflict when a done member did not flag, or severities differ', () => {
    expect(isConflict([take('WARNING'), take('ignored')])).toBe(true);
    expect(isConflict([take('WARNING'), take('CRITICAL')])).toBe(true);
    expect(isConflict([take('WARNING'), take('WARNING')])).toBe(false);
  });

  it('no_result takes never create a conflict (EC-7)', () => {
    expect(isConflict([take('WARNING'), take('no_result')])).toBe(false);
    expect(isConflict([take('WARNING'), take('WARNING'), take('no_result')])).toBe(false);
  });
});

const member = (over: Partial<GroupMember> & Pick<GroupMember, 'runId'>): GroupMember => ({
  agentId: over.runId,
  agentName: over.runId,
  provider: 'openai',
  model: 'm',
  status: 'done',
  error: null,
  durationMs: null,
  costUsd: null,
  ...over,
});

const frow = (id: string, over: Partial<FindingRow> = {}): FindingRow =>
  ({
    id,
    reviewId: 'rev',
    file: 'a.ts',
    startLine: 10,
    endLine: 10,
    severity: 'WARNING',
    category: 'bug',
    title: `title ${id}`,
    rationale: 'r',
    suggestion: null,
    confidence: 0.5,
    kind: 'finding',
    trifectaComponents: null,
    acceptedAt: null,
    dismissedAt: null,
    ...over,
  }) as FindingRow;

const review = (runId: string, findings: FindingRow[]): GroupReview => ({
  review: { runId, verdict: 'comment', score: 80, summary: 's' },
  findings,
});

const GROUP = { id: 'g1', prId: 'pr1', ranAt: new Date('2026-10-09T10:00:00Z') };

describe('buildMultiAgentRun (AC-13, AC-17, EC-8)', () => {
  it('total duration is the max of known durations (0 when none); total cost the sum (null when none)', () => {
    const some = buildMultiAgentRun(
      GROUP,
      { number: 7 },
      [
        member({ runId: 'a', durationMs: 1000, costUsd: 0.5 }),
        member({ runId: 'b', durationMs: 4000, costUsd: 0.25 }),
        member({ runId: 'c', durationMs: null, costUsd: null }),
      ],
      [],
    );
    expect(some.total_duration_ms).toBe(4000);
    expect(some.total_cost_usd).toBeCloseTo(0.75);
    expect(some.agent_count).toBe(3);
    expect(some.pr_number).toBe(7);

    const none = buildMultiAgentRun(GROUP, { number: 7 }, [member({ runId: 'a' }), member({ runId: 'b' })], []);
    expect(none.total_duration_ms).toBe(0);
    expect(none.total_cost_usd).toBeNull();
  });

  it('orders columns by agent name (case-insensitive), deleted agents last, then run id; unknown status -> failed', () => {
    const run = buildMultiAgentRun(
      GROUP,
      { number: 1 },
      [
        member({ runId: 'r4', agentId: null, agentName: null }),
        member({ runId: 'r3', agentName: 'beta' }),
        member({ runId: 'r2', agentName: 'Alpha', status: 'weird' }),
        member({ runId: 'r1', agentId: null, agentName: null }),
      ],
      [],
    );
    expect(run.columns.map((c) => c.run_id)).toEqual(['r2', 'r3', 'r1', 'r4']);
    expect(run.columns[0]!.status).toBe('failed');
  });

  it('with one member still running, groups come from the stored findings only (EC-8)', () => {
    const run = buildMultiAgentRun(
      GROUP,
      { number: 1 },
      [member({ runId: 'a', agentName: 'a' }), member({ runId: 'b', agentName: 'b', status: 'running' })],
      [review('a', [frow('f1')])],
    );
    expect(run.finding_groups).toHaveLength(1);
    expect(run.conflicts[0]!.takes.map((t) => t.verdict)).toEqual(['WARNING', 'no_result']);
    expect(run.conflicts[0]!.is_conflict).toBe(false);
  });

  it('builds one conflict per group, keeps dismissed findings, never mutates input (AC-17)', () => {
    const f1 = frow('f1', { severity: 'CRITICAL', dismissedAt: new Date() });
    const f2 = frow('f2', { severity: 'WARNING', title: 'other title' });
    const reviews = [review('a', [f1]), review('b', [f2])];
    const before = structuredClone(reviews);
    const run = buildMultiAgentRun(
      GROUP,
      { number: 1 },
      [member({ runId: 'a', agentName: 'a' }), member({ runId: 'b', agentName: 'b' })],
      reviews,
    );
    expect(reviews).toEqual(before);
    expect(run.finding_groups).toEqual([
      { id: 'f1', file: 'a.ts', start_line: 10, end_line: 10, finding_ids: ['f1', 'f2'], run_ids: ['a', 'b'] },
    ]);
    expect(run.conflicts).toHaveLength(1);
    expect(run.conflicts[0]).toMatchObject({ group_id: 'f1', title: 'title f1', is_conflict: true });
    expect(run.columns[0]!.findings[0]).toMatchObject({ id: 'f1', severity: 'CRITICAL', end_line: 10 });
  });
});
