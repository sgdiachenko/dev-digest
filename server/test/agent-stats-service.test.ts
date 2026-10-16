import { describe, it, expect } from 'vitest';
import { NotFoundError } from '../src/platform/errors.js';
import { AgentStatsService } from '../src/modules/agent-stats/service.js';
import {
  FakeAgentStatsStore,
  RecordingLogger,
  WS,
  makeAgent,
  makeRun,
  makeStatsRaw,
} from './helpers/agent-stats-fakes.js';

const FROM = '2026-10-01T00:00:00.000Z';
const TO = '2026-10-31T00:00:00.000Z';
const CLOCK = new Date('2026-11-01T08:00:00.000Z');
const AGENT = 'a1';

function setup() {
  const store = new FakeAgentStatsStore();
  // Titles / PR text a careless log line could pick up.
  store.performanceResult = {
    agents: [makeAgent({ id: AGENT, name: 'SECRET-AGENT-NAME' })],
    runs: [makeRun({ agentId: AGENT, ranAt: new Date('2026-10-10T00:00:00.000Z') })],
    decisions: [],
    lastFinished: [],
  };
  store.agentStatsResult = makeStatsRaw({
    agent: makeAgent({ id: AGENT, name: 'SECRET-AGENT-NAME' }),
    runs: [makeRun({ agentId: AGENT, ranAt: new Date('2026-10-10T00:00:00.000Z') })],
  });
  store.runHistoryResult = {
    rows: [
      {
        runId: 'r1',
        ranAt: new Date('2026-10-10T00:00:00.000Z'),
        status: 'done',
        repoId: 'repo-1',
        repoFullName: 'acme/SECRET-REPO',
        prNumber: 7,
        tokensIn: 1,
        tokensOut: 2,
        costUsd: 0.1,
        findingsCount: 3,
      },
    ],
    total: 1,
  };
  const log = new RecordingLogger();
  return { store, log, service: new AgentStatsService(store, log, () => CLOCK) };
}

describe('AgentStatsService logging (NFR-17)', () => {
  it('logs exactly one info per call with the fixed keys and no PR or agent text', async () => {
    const { service, log } = setup();
    await service.performance(WS, FROM, TO);
    await service.agentStats(WS, AGENT, FROM, TO);
    await service.runHistory(WS, AGENT, FROM, TO, 1);

    expect(log.lines).toHaveLength(3);
    for (const { obj } of log.lines) {
      expect(Object.keys(obj).sort()).toEqual(['duration_ms', 'from', 'route', 'rows', 'to', 'workspace_id']);
    }
    expect(log.lines.map((l) => l.obj.route)).toEqual(['agents.performance', 'agents.stats', 'agents.stats.runs']);
    expect(log.lines.map((l) => l.obj.rows)).toEqual([1, 1, 1]);
    expect(JSON.stringify(log.lines)).not.toMatch(/SECRET/);
  });

  it('does not log when the agent is not found', async () => {
    const { service, store, log } = setup();
    store.agentStatsResult = null;
    await expect(service.agentStats(WS, AGENT, FROM, TO)).rejects.toThrow();
    expect(log.lines).toEqual([]);
  });
});

describe('AgentStatsService results', () => {
  it('stamps as_of with the injected clock and derives the previous period', async () => {
    const { service } = setup();
    const out = await service.performance(WS, FROM, TO);
    expect(out.as_of).toBe(CLOCK.toISOString());
    expect(out.period).toEqual({
      from: FROM,
      to: TO,
      previous_from: '2026-09-01T00:00:00.000Z',
      previous_to: FROM,
    });
  });

  it('throws NotFoundError when the store returns null (AC-38)', async () => {
    const { service, store } = setup();
    store.agentStatsResult = null;
    store.runHistoryResult = null;
    await expect(service.agentStats(WS, AGENT, FROM, TO)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.runHistory(WS, AGENT, FROM, TO, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('asks the store for 20 rows of the requested page', async () => {
    const { service, store } = setup();
    const page = await service.runHistory(WS, AGENT, FROM, TO, 2);
    expect(page.page).toBe(2);
    expect(store.calls[0]!.args.slice(3)).toEqual([2, 20]);
  });
});
