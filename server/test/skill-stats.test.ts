import { describe, it, expect } from 'vitest';
import { computeSkillStats, traceHasSkill } from '../src/modules/skills/helpers.js';
import type { SkillStatsRaw } from '../src/modules/skills/helpers.js';

/**
 * The Stats tab's arithmetic. Every tile is a plain count/percentage over rows
 * the repository already scoped to this skill's linked agents — this file
 * covers the honesty rules from the plan: null (not 0%) when there is nothing
 * to measure yet, and findings/pull-frequency computed from real fields.
 */

describe('traceHasSkill', () => {
  it('true when the skill id is in trace.config.skills', () => {
    expect(traceHasSkill({ config: { skills: ['s1', 's2'] } }, 's1')).toBe(true);
  });

  it('false when the skill id is absent', () => {
    expect(traceHasSkill({ config: { skills: ['s2'] } }, 's1')).toBe(false);
  });

  it('false for a pre-L02 trace with no config.skills at all', () => {
    expect(traceHasSkill({ config: { agent: 'General' } }, 's1')).toBe(false);
  });

  it('never throws on a malformed/missing trace', () => {
    expect(traceHasSkill(null, 's1')).toBe(false);
    expect(traceHasSkill(undefined, 's1')).toBe(false);
    expect(traceHasSkill('not an object', 's1')).toBe(false);
    expect(traceHasSkill({}, 's1')).toBe(false);
  });
});

describe('computeSkillStats', () => {
  const base: SkillStatsRaw = { skillId: 'skill-1', agents: [], findings: [], runs: [] };

  it('agent_count reflects the linked-agents list', () => {
    const raw: SkillStatsRaw = {
      ...base,
      agents: [{ id: 'a1', name: 'Security Reviewer' }, { id: 'a2', name: 'Performance Reviewer' }],
    };
    expect(computeSkillStats(raw).agent_count).toBe(2);
  });

  it('pull_pct is null (not 0) when no linked agent has run yet', () => {
    expect(computeSkillStats(base).pull_pct).toBeNull();
  });

  it('pull_pct is the fraction of runs whose trace recorded this skill', () => {
    const raw: SkillStatsRaw = {
      ...base,
      runs: [
        { trace: { config: { skills: ['skill-1'] } } },
        { trace: { config: { skills: ['skill-1'] } } },
        { trace: { config: { skills: ['other'] } } },
        { trace: null }, // failed run, no trace — counts toward the denominator only
      ],
    };
    expect(computeSkillStats(raw).pull_pct).toBe(50);
  });

  it('accept_pct is null when nothing has been triaged', () => {
    const raw: SkillStatsRaw = {
      ...base,
      findings: [{ category: 'security', acceptedAt: null, dismissedAt: null }],
    };
    expect(computeSkillStats(raw).accept_pct).toBeNull();
  });

  it('accept_pct is accepted / (accepted + dismissed)', () => {
    const raw: SkillStatsRaw = {
      ...base,
      findings: [
        { category: 'security', acceptedAt: new Date(), dismissedAt: null },
        { category: 'security', acceptedAt: new Date(), dismissedAt: null },
        { category: 'bug', acceptedAt: null, dismissedAt: new Date() },
        { category: 'bug', acceptedAt: null, dismissedAt: null }, // not triaged — excluded
      ],
    };
    expect(computeSkillStats(raw).accept_pct).toBe(67); // 2/3 rounded
  });

  it('findings_30d and by_category count every finding in the window, triaged or not', () => {
    const raw: SkillStatsRaw = {
      ...base,
      findings: [
        { category: 'security', acceptedAt: null, dismissedAt: null },
        { category: 'security', acceptedAt: new Date(), dismissedAt: null },
        { category: 'bug', acceptedAt: null, dismissedAt: null },
      ],
    };
    const stats = computeSkillStats(raw);
    expect(stats.findings_30d).toBe(3);
    expect(stats.by_category.sort((a, b) => a.category.localeCompare(b.category))).toEqual([
      { category: 'bug', count: 1 },
      { category: 'security', count: 2 },
    ]);
  });
});
