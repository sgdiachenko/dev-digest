/**
 * T6 — Agent Performance routes via app.inject(), DB-free: the store is a
 * container override. Invalid input is a 422 before any store call.
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AgentPerf, AgentRunHistoryPage, AgentStats } from '../src/vendor/shared/index.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import { MAX_PERIOD_MS } from '../src/modules/_shared/stats-rules.js';
import { FakeAgentStatsStore, makeAgent, makeRun, makeStatsRaw } from './helpers/agent-stats-fakes.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const AGENT = '11111111-1111-4111-8111-111111111111';
const DAY = 86_400_000;

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function boot(store = new FakeAgentStatsStore()) {
  app = await buildApp({
    config,
    overrides: { auth: new MockAuthProvider(), agentStatsStore: store },
  });
  return { app, store };
}

const iso = (ms: number) => new Date(ms).toISOString();
const period = () => {
  const to = Date.now() - 1000;
  return { from: iso(to - 2 * DAY), to: iso(to) };
};
const qs = (p: Record<string, string>) => new URLSearchParams(p).toString();

const PATHS = [
  '/agents/performance',
  `/agents/${AGENT}/stats`,
  `/agents/${AGENT}/stats/runs`,
] as const;
const withPage = (path: string, p: Record<string, string>) =>
  path.endsWith('/runs') ? { ...p, page: '1' } : p;

describe('period validation (AC-35, AC-36)', () => {
  it.each(PATHS)('%s: a missing to, a bare local time and garbage are 422 with no figures', async (path) => {
    const { app, store } = await boot();
    const { from, to } = period();
    const bad: Record<string, string>[] = [
      { from },
      { from: '2026-10-01T00:00:00', to },
      { from: 'x', to },
      { from, to: '2026-10-01' },
    ];
    for (const p of bad) {
      const res = await app.inject({ method: 'GET', url: `${path}?${qs(withPage(path, p))}` });
      expect(res.statusCode).toBe(422);
      expect(res.json()).not.toHaveProperty('summary');
    }
    expect(store.calls).toEqual([]);
  });

  it.each(PATHS)('%s: reversed, equal, future and too long periods are 422', async (path) => {
    const { app, store } = await boot();
    const now = Date.now();
    const cases = [
      { from: iso(now - DAY), to: iso(now - 2 * DAY) },
      { from: iso(now - DAY), to: iso(now - DAY) },
      { from: iso(now + DAY), to: iso(now + 2 * DAY) },
      { from: iso(now - MAX_PERIOD_MS - 60_000), to: iso(now) },
    ];
    for (const p of cases) {
      const res = await app.inject({ method: 'GET', url: `${path}?${qs(withPage(path, p))}` });
      expect(res.statusCode).toBe(422);
    }
    expect(store.calls).toEqual([]);
  });

  it('accepts a period with a numeric offset', async () => {
    const { app } = await boot();
    const to = Date.now() - 60_000;
    const res = await app.inject({
      method: 'GET',
      url: `/agents/performance?${qs({ from: iso(to - DAY).replace('Z', '+00:00'), to: iso(to).replace('Z', '+00:00') })}`,
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('run history page (AC-37)', () => {
  it.each(['0', '1.5', 'x', '-1'])('page=%s is 422', async (page) => {
    const { app, store } = await boot();
    const res = await app.inject({
      method: 'GET',
      url: `/agents/${AGENT}/stats/runs?${qs({ ...period(), page })}`,
    });
    expect(res.statusCode).toBe(422);
    expect(store.calls).toEqual([]);
  });

  it('a missing page is 422', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: `/agents/${AGENT}/stats/runs?${qs(period())}` });
    expect(res.statusCode).toBe(422);
  });
});

describe('unknown agent (AC-38, EC-21)', () => {
  it('answers 404 on /stats and /stats/runs when the store has no such agent', async () => {
    const store = new FakeAgentStatsStore();
    store.agentStatsResult = null;
    store.runHistoryResult = null;
    const { app } = await boot(store);
    const stats = await app.inject({ method: 'GET', url: `/agents/${AGENT}/stats?${qs(period())}` });
    const runs = await app.inject({
      method: 'GET',
      url: `/agents/${AGENT}/stats/runs?${qs({ ...period(), page: '1' })}`,
    });
    expect(stats.statusCode).toBe(404);
    expect(runs.statusCode).toBe(404);
  });

  it('a non-uuid agent id is 422', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: `/agents/nope/stats?${qs(period())}` });
    expect(res.statusCode).toBe(422);
  });
});

describe('200 bodies (AC-39)', () => {
  it('GET /agents/performance is served by agent-stats and parses as AgentPerf', async () => {
    const store = new FakeAgentStatsStore();
    store.performanceResult = {
      agents: [makeAgent({ id: AGENT })],
      runs: [makeRun({ agentId: AGENT, ranAt: new Date(Date.now() - DAY) })],
      decisions: [],
      lastFinished: [],
    };
    const { app } = await boot(store);
    const p = period();
    const res = await app.inject({ method: 'GET', url: `/agents/performance?${qs(p)}` });
    expect(res.statusCode).toBe(200);
    const body = AgentPerf.parse(res.json());
    expect(body.period.from).toBe(p.from);
    expect(body.period.to).toBe(p.to);
    expect(Date.parse(body.period.previous_from)).toBe(Date.parse(p.from) - (Date.parse(p.to) - Date.parse(p.from)));
    expect(body.period.previous_to).toBe(p.from);
    expect(Number.isNaN(Date.parse(body.as_of))).toBe(false);
    expect(body.summary.runs).toBe(1);
  });

  it('GET /agents/:id/stats parses as AgentStats and passes the severity bucket size', async () => {
    const store = new FakeAgentStatsStore();
    store.agentStatsResult = makeStatsRaw({ agent: makeAgent({ id: AGENT, name: 'Sec' }) });
    const { app } = await boot(store);
    const res = await app.inject({ method: 'GET', url: `/agents/${AGENT}/stats?${qs(period())}` });
    expect(res.statusCode).toBe(200);
    const body = AgentStats.parse(res.json());
    expect(body.agent_id).toBe(AGENT);
    expect(store.calls[0]!.args[1]).toBe(AGENT);
    expect(store.calls[0]!.args[3]).toBe(4 * 3_600_000);
  });

  it('GET /agents/:id/stats/runs parses as AgentRunHistoryPage, 20 per page', async () => {
    const store = new FakeAgentStatsStore();
    store.runHistoryResult = {
      rows: [
        {
          runId: 'r1',
          ranAt: new Date('2026-10-01T00:00:00.000Z'),
          status: 'failed',
          repoId: null,
          repoFullName: null,
          prNumber: null,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: null,
          findingsCount: null,
        },
      ],
      total: 41,
    };
    const { app } = await boot(store);
    const res = await app.inject({
      method: 'GET',
      url: `/agents/${AGENT}/stats/runs?${qs({ ...period(), page: '3' })}`,
    });
    expect(res.statusCode).toBe(200);
    const body = AgentRunHistoryPage.parse(res.json());
    expect([body.page, body.page_size, body.total]).toEqual([3, 20, 41]);
    expect(store.calls[0]!.args.slice(3)).toEqual([3, 20]);
  });
});
