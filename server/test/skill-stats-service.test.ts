/** T31 — SkillStatsService over a FakeSkillStatsStore (no DB, no clock, no network). */
import { describe, it, expect } from 'vitest';
import { NotFoundError } from '../src/platform/errors.js';
import { SkillStatsService } from '../src/modules/skills/stats-service.js';
import type {
  SkillStatsFacts,
  SkillStatsLogger,
  SkillStatsStore,
  SkillStatsWindow,
} from '../src/modules/skills/types.js';

const WS = 'ws-1';
const HOUR = 3_600_000;
const NOW = new Date('2026-10-15T12:00:00.000Z');

class FakeSkillStatsStore implements SkillStatsStore {
  ref: { id: string; enabled: boolean } | null = { id: 's1', enabled: true };
  facts: SkillStatsFacts = { links: [], runs: [], runFindings: [] };
  calls: { workspaceId: string; window: SkillStatsWindow; skillIds: string[] }[] = [];

  async skillRef(): Promise<{ id: string; enabled: boolean } | null> {
    return this.ref;
  }

  async statsFacts(workspaceId: string, window: SkillStatsWindow, skillIds: string[]): Promise<SkillStatsFacts> {
    this.calls.push({ workspaceId, window, skillIds });
    return this.facts;
  }
}

class FakeLogger implements SkillStatsLogger {
  lines: Record<string, unknown>[] = [];
  info(obj: Record<string, unknown>): void {
    this.lines.push(obj);
  }
}

function make() {
  const store = new FakeSkillStatsStore();
  const log = new FakeLogger();
  return { store, log, service: new SkillStatsService(store, log, () => NOW) };
}

describe('SkillStatsService.forSkill', () => {
  it('with no period the window is [as_of - 720h, as_of) and period echoes it (skill AC-8)', async () => {
    const { service, store } = make();
    const stats = await service.forSkill(WS, 's1');
    expect(stats.as_of).toBe(NOW.toISOString());
    expect(stats.period).toEqual({ from: new Date(NOW.getTime() - 720 * HOUR).toISOString(), to: NOW.toISOString() });
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0]!.window.from.getTime()).toBe(NOW.getTime() - 720 * HOUR);
  });

  it('with a period the bounds are exactly the given ones', async () => {
    const { service, store } = make();
    const from = '2026-09-01T00:00:00.000Z';
    const to = '2026-09-02T00:00:00.000Z';
    const stats = await service.forSkill(WS, 's1', from, to);
    expect(stats.period).toEqual({ from, to });
    expect(store.calls[0]!.window).toEqual({ from: new Date(from), to: new Date(to) });
    expect(store.calls[0]!.skillIds).toEqual(['s1']);
  });

  it('an unknown skill is a NotFoundError and reads no facts (skill AC-10, EC-15)', async () => {
    const { service, store } = make();
    store.ref = null;
    await expect(service.forSkill(WS, 's1')).rejects.toBeInstanceOf(NotFoundError);
    expect(store.calls).toEqual([]);
  });

  it('logs exactly one info line with route, workspace, period and duration, and no finding or skill text (skill NFR-10)', async () => {
    const { service, log, store } = make();
    store.facts = {
      links: [{ skillId: 's1', agentId: 'a1', agentName: 'Secret Agent Name' }],
      runs: [],
      runFindings: [{ runId: 'r1', category: 'leaky-category', accepted: 1, dismissed: 0, pending: 0 }],
    };
    await service.forSkill(WS, 's1');
    expect(log.lines).toHaveLength(1);
    expect(Object.keys(log.lines[0]!).sort()).toEqual(['duration_ms', 'from', 'route', 'to', 'workspace_id']);
    expect(log.lines[0]).toMatchObject({ route: 'GET /skills/:id/stats', workspace_id: WS });
    const text = JSON.stringify(log.lines);
    expect(text).not.toContain('leaky-category');
    expect(text).not.toContain('Secret Agent Name');
  });
});

describe('SkillStatsService.forList', () => {
  it('makes one statsFacts call over [now - 720h, now) for all ids (skill AC-11, EC-18)', async () => {
    const { service, store } = make();
    const out = await service.forList(WS, ['s1', 's2', 's3']);
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0]!.skillIds).toEqual(['s1', 's2', 's3']);
    expect(store.calls[0]!.window).toEqual({ from: new Date(NOW.getTime() - 720 * HOUR), to: NOW });
    expect([...out.keys()]).toEqual(['s1', 's2', 's3']);
    expect(out.get('s2')!.period.to).toBe(NOW.toISOString());
  });

  it('with no ids reads nothing', async () => {
    const { service, store } = make();
    expect((await service.forList(WS, [])).size).toBe(0);
    expect(store.calls).toEqual([]);
  });
});
