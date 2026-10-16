import { describe, it, expect } from 'vitest';
import { SkillStats, SkillWithStats } from '../src/vendor/shared/contracts/knowledge.js';

const sample = (over: Record<string, unknown> = {}) => ({
  agent_count: 2,
  agents: [
    { id: 'a1', name: 'Alpha' },
    { id: 'a2', name: 'Beta' },
  ],
  pull_pct: 71,
  accept_pct: 74,
  findings_30d: 96,
  by_category: [{ category: 'security', count: 96 }],
  findings: 96,
  skill_runs: 7,
  pull_runs: 5,
  pull_runs_total: 7,
  runs_without_skill_data: 4,
  accepted: 12,
  dismissed: 4,
  pending: 80,
  accept_rate: 0.75,
  small_sample: false,
  last_used_at: '2026-10-14T09:00:00.000Z',
  period: { from: '2026-09-15T00:00:00.000Z', to: '2026-10-15T00:00:00.000Z' },
  as_of: '2026-10-15T00:00:00.000Z',
  ...over,
});

describe('SkillStats contract (T28, skill NFR-11)', () => {
  it('keeps every old key and adds the new ones', () => {
    const keys = Object.keys(SkillStats.shape);
    for (const old of ['agent_count', 'pull_pct', 'accept_pct', 'findings_30d', 'by_category', 'agents']) {
      expect(keys).toContain(old);
    }
    for (const added of [
      'findings', 'skill_runs', 'pull_runs', 'pull_runs_total', 'runs_without_skill_data',
      'accepted', 'dismissed', 'pending', 'accept_rate', 'small_sample', 'last_used_at',
      'period', 'as_of',
    ]) {
      expect(keys).toContain(added);
    }
  });

  it('keeps the old key types (number | null percentages, int counts)', () => {
    expect(SkillStats.safeParse(sample({ pull_pct: null, accept_pct: null })).success).toBe(true);
    expect(SkillStats.safeParse(sample({ agent_count: 1.5 })).success).toBe(false);
    expect(SkillStats.safeParse(sample({ findings_30d: '96' })).success).toBe(false);
  });

  it('parses a full sample with period as { from, to } and keeps nullable fields nullable', () => {
    const parsed = SkillStats.parse(sample({ accept_rate: null, last_used_at: null }));
    expect(parsed.period).toEqual({ from: '2026-09-15T00:00:00.000Z', to: '2026-10-15T00:00:00.000Z' });
    expect(parsed.accept_rate).toBeNull();
    expect(parsed.last_used_at).toBeNull();
  });

  it('rejects an accept_rate outside 0..1 and a period with no bounds', () => {
    expect(SkillStats.safeParse(sample({ accept_rate: 2 })).success).toBe(false);
    expect(SkillStats.safeParse(sample({ accept_rate: -0.1 })).success).toBe(false);
    expect(SkillStats.safeParse(sample({ period: { from: 'x' } })).success).toBe(false);
  });

  it('SkillWithStats still carries stats', () => {
    expect(Object.keys(SkillWithStats.shape)).toContain('stats');
  });
});
