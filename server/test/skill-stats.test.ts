import { describe, it, expect } from 'vitest';
import { computeSkillStats, indexSkillRuns } from '../src/modules/skills/helpers.js';
import type {
  SkillLink,
  SkillRunFact,
  SkillRunFindings,
  SkillStatsFacts,
} from '../src/modules/skills/types.js';

/**
 * The skill Stats arithmetic over hand-built facts (T29). The rules are the
 * agent-performance ones from `_shared/stats-rules.ts`: pull over linked
 * agents' runs that recorded a skill list, findings from done skill runs of
 * any agent, null (never 0%) when there is nothing to measure.
 */

const S = 'skill-1';
const window = { from: new Date('2026-09-15T00:00:00.000Z'), to: new Date('2026-10-15T00:00:00.000Z') };
const asOf = new Date('2026-10-15T00:00:00.000Z');
const inWindow = (day: number) => new Date(Date.UTC(2026, 8, 15 + day, 10));

const link = (agentId: string, agentName: string, skillId = S): SkillLink => ({ skillId, agentId, agentName });
let seq = 0;
const run = (over: Partial<SkillRunFact> = {}): SkillRunFact => ({
  id: `run-${++seq}`,
  agentId: 'a1',
  status: 'done',
  ranAt: inWindow(1),
  skills: [S],
  ...over,
});
const fnd = (runId: string, category: string, accepted = 0, dismissed = 0, pending = 0): SkillRunFindings => ({
  runId,
  category,
  accepted,
  dismissed,
  pending,
});
const facts = (over: Partial<SkillStatsFacts> = {}): SkillStatsFacts => ({
  links: [link('a1', 'Alpha')],
  runs: [],
  runFindings: [],
  ...over,
});
const compute = (f: SkillStatsFacts) => computeSkillStats(S, f, window, asOf);

describe('computeSkillStats', () => {
  it('lists linked agents A→Z (disabled included, no cap) and counts them (AC-1, EC-24, EC-25)', () => {
    const links = Array.from({ length: 31 }, (_, i) => link(`id-${i}`, `agent ${String(30 - i).padStart(2, '0')}`));
    links.push(link('other', 'zeta', 'skill-2'));
    const s = compute(facts({ links }));
    expect(s.agent_count).toBe(31);
    expect(s.agents).toHaveLength(31);
    expect(s.agents[0]!.name).toBe('agent 00');
    expect(s.agents.map((a) => a.name)).toEqual([...s.agents.map((a) => a.name)].sort());
  });

  it('pull: the base is linked runs with a recorded list; [] counts in the base, not in pull_runs (AC-2, EC-1, EC-6)', () => {
    const s = compute(
      facts({
        runs: [run(), run(), run({ skills: [] }), run({ skills: ['other'] })],
      }),
    );
    // 4 runs with lists: 2 loaded, 1 empty, 1 other skill -> 2 of 4
    expect(s.pull_runs_total).toBe(4);
    expect(s.pull_runs).toBe(2);
    expect(s.pull_pct).toBe(50);
  });

  it('pull_pct is 67 for 2 of 3 and null (never 0) for an empty base (AC-2, EC-20)', () => {
    const two = compute(facts({ runs: [run(), run(), run({ skills: ['x'] })] }));
    expect(two.pull_pct).toBe(67);
    const none = compute(facts({ runs: [run({ skills: undefined }), run({ skills: null })] }));
    expect(none.pull_pct).toBeNull();
    expect(none.pull_runs_total).toBe(0);
    expect(none.runs_without_skill_data).toBe(2);
  });

  it('runs without a usable list go to runs_without_skill_data, never into the base (AC-3, EC-7, EC-27)', () => {
    const s = compute(
      facts({
        runs: [
          run(),
          run({ skills: undefined, status: 'failed' }),
          run({ skills: null, status: 'cancelled' }),
          run({ skills: {} }),
          run({ skills: ['x', 1] }),
        ],
      }),
    );
    expect(s.pull_runs_total).toBe(1);
    expect(s.runs_without_skill_data).toBe(4);
    expect(s.skill_runs).toBe(1);
  });

  it('counts findings of skill runs of unlinked and deleted agents, not of failed runs (AC-4, EC-2, EC-3, EC-12, EC-13)', () => {
    const linked = run({ id: 'r-linked' });
    const unlinked = run({ id: 'r-unlinked', agentId: 'gone' });
    const deleted = run({ id: 'r-deleted', agentId: null });
    const failed = run({ id: 'r-failed', status: 'failed' });
    const notSkill = run({ id: 'r-other', skills: ['x'] });
    const s = compute(
      facts({
        runs: [linked, unlinked, deleted, failed, notSkill],
        runFindings: [
          fnd('r-linked', 'security', 1, 0, 1),
          fnd('r-linked', 'bug', 0, 1, 0),
          fnd('r-unlinked', 'security', 0, 0, 2),
          fnd('r-deleted', 'style', 1, 0, 0),
          fnd('r-failed', 'security', 5, 5, 5),
          fnd('r-other', 'security', 9, 9, 9),
        ],
      }),
    );
    expect(s.skill_runs).toBe(4);
    expect(s.findings).toBe(6);
    expect(s.by_category).toEqual([
      { category: 'security', count: 4 },
      { category: 'bug', count: 1 },
      { category: 'style', count: 1 },
    ]);
  });

  it('two agents flagging the same issue both count (EC-13) and by_category ties sort A→Z', () => {
    const a = run({ id: 'ra', agentId: 'a1' });
    const b = run({ id: 'rb', agentId: 'a2' });
    const s = compute(facts({ runs: [a, b], runFindings: [fnd('ra', 'zeta', 0, 0, 1), fnd('rb', 'alpha', 0, 0, 1)] }));
    expect(s.findings).toBe(2);
    expect(s.by_category.map((c) => c.category)).toEqual(['alpha', 'zeta']);
  });

  it('accept figures: sums, rate, small sample at 9 decided and not at 10, null with 0 decided (AC-5, EC-11, EC-26)', () => {
    const r = run({ id: 'r1' });
    const nine = compute(facts({ runs: [r], runFindings: [fnd('r1', 'c', 6, 3, 4)] }));
    expect([nine.accepted, nine.dismissed, nine.pending]).toEqual([6, 3, 4]);
    expect(nine.accept_rate).toBeCloseTo(6 / 9);
    expect(nine.accept_pct).toBe(67);
    expect(nine.small_sample).toBe(true);

    const ten = compute(facts({ runs: [r], runFindings: [fnd('r1', 'c', 5, 5, 0)] }));
    expect(ten.small_sample).toBe(false);
    expect(ten.accept_pct).toBe(50);

    const none = compute(facts({ runs: [r], runFindings: [fnd('r1', 'c', 0, 0, 3)] }));
    expect(none.accept_rate).toBeNull();
    expect(none.accept_pct).toBeNull();
    expect(none.findings).toBe(3);
  });

  it('skill_runs counts skill runs of every agent in the window (AC-6)', () => {
    const s = compute(
      facts({ runs: [run(), run({ agentId: 'gone' }), run({ agentId: null }), run({ skills: ['x'] })] }),
    );
    expect(s.skill_runs).toBe(3);
  });

  it('last_used_at is the latest skill run at any time, null when never used (AC-7)', () => {
    const outside = new Date('2026-11-20T08:00:00.000Z');
    const s = compute(facts({ runs: [run({ ranAt: inWindow(2) }), run({ ranAt: outside }), run({ ranAt: new Date('2026-12-01T00:00:00Z'), skills: ['x'] })] }));
    expect(s.last_used_at).toBe(outside.toISOString());
    expect(s.skill_runs).toBe(1);
    expect(compute(facts({ runs: [run({ skills: ['x'] })] })).last_used_at).toBeNull();
  });

  it('a run at from counts and one at to does not (EC-14); unfinished runs are not in facts (EC-8)', () => {
    const s = compute(
      facts({ runs: [run({ ranAt: window.from }), run({ ranAt: window.to }), run({ ranAt: new Date(window.from.getTime() - 1) })] }),
    );
    expect(s.pull_runs_total).toBe(1);
    expect(s.skill_runs).toBe(1);
  });

  it('invariants: pull_runs <= pull_runs_total, category sum = findings = decisions, findings_30d = findings, period echo (NFR-6, NFR-11)', () => {
    const runs = [run({ id: 'r1' }), run({ id: 'r2', skills: [] }), run({ id: 'r3', agentId: 'gone' })];
    const runFindings = [fnd('r1', 'a', 2, 1, 1), fnd('r1', 'b', 0, 0, 3), fnd('r3', 'a', 1, 0, 0)];
    const s = compute(facts({ runs, runFindings }));
    expect(s.pull_runs).toBeLessThanOrEqual(s.pull_runs_total);
    expect(s.by_category.reduce((n, c) => n + c.count, 0)).toBe(s.findings);
    expect(s.accepted + s.dismissed + s.pending).toBe(s.findings);
    expect(s.findings_30d).toBe(s.findings);
    expect(s.period).toEqual({ from: window.from.toISOString(), to: window.to.toISOString() });
    expect(s.as_of).toBe(asOf.toISOString());
  });

  it('shuffled facts give a deep-equal result', () => {
    const runs = [run({ id: 'r1' }), run({ id: 'r2', agentId: 'a2' }), run({ id: 'r3', skills: ['x'] })];
    const runFindings = [fnd('r1', 'a', 1, 0, 0), fnd('r2', 'b', 0, 1, 0), fnd('r1', 'b', 0, 0, 2)];
    const links = [link('a1', 'Alpha'), link('a2', 'Beta')];
    const one = compute({ links, runs, runFindings });
    const two = compute({ links: [...links].reverse(), runs: [...runs].reverse(), runFindings: [...runFindings].reverse() });
    expect(two).toEqual(one);
  });
});

describe('shared SkillRunIndex', () => {
  const sharedFacts = (): SkillStatsFacts => {
    const runs = [
      run({ id: 'r1', skills: ['s1'] }),
      run({ id: 'r2', agentId: 'a2', skills: ['s1', 's2'] }),
      run({ id: 'r3', skills: ['s2'], status: 'failed' }),
      run({ id: 'r4', skills: ['s2'] }),
    ];
    const runFindings = [fnd('r1', 'a', 2, 1, 1), fnd('r2', 'b', 0, 3, 0), fnd('r3', 'a', 5, 0, 0), fnd('r4', 'a', 1, 0, 2), fnd('r2', 'a', 1, 0, 0)];
    return { links: [link('a1', 'Alpha', 's1'), link('a2', 'Beta', 's2')], runs, runFindings };
  };

  it('a shared index gives the same result per skill as computing without one, findings included', () => {
    const f = sharedFacts();
    const index = indexSkillRuns(f, window);
    for (const id of ['s1', 's2', 's3']) {
      const shared = computeSkillStats(id, f, window, asOf, index);
      expect(shared).toEqual(computeSkillStats(id, f, window, asOf));
    }
    expect(computeSkillStats('s1', f, window, asOf, index).findings).toBe(8);
    expect(computeSkillStats('s2', f, window, asOf, index).findings).toBe(7);
  });

  it('throws when the index was built for a different window or different facts', () => {
    const f = sharedFacts();
    const index = indexSkillRuns(f, window);
    const other = { from: window.from, to: new Date(window.to.getTime() + 1) };
    expect(() => computeSkillStats('s1', f, other, asOf, index)).toThrow(Error);
    expect(() => computeSkillStats('s1', sharedFacts(), window, asOf, index)).toThrow(Error);
  });
});
