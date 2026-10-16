import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildStatsDataset, type StatsDataset } from './helpers/stats-dataset.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const SAMPLES = 20;
const BUDGET_MS = 500;
const DAY_MS = 86_400_000;

const p95 = (ms: number[]) => [...ms].sort((a, b) => a - b)[Math.ceil(ms.length * 0.95) - 1]!;

/**
 * NFR-1 / NFR-2: the three stats endpoints stay under 500 ms (p95 of 20 warm
 * samples) on 20 agents, 10,000 runs over ~400 days and 50,000 findings.
 */
d('agent stats performance (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let data: StatsDataset;
  const now = Date.now();

  const period = (days: number) =>
    new URLSearchParams({
      from: new Date(now - days * DAY_MS).toISOString(),
      to: new Date(now).toISOString(),
    }).toString();

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    const { workspaceId } = await seed(db);
    data = await buildStatsDataset(db, workspaceId);
    app = await buildApp({
      config: config(),
      db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: '' }) },
    });
  }, 300_000);
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function measure(url: string): Promise<number> {
    await app.inject({ method: 'GET', url }); // warm up
    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      const res = await app.inject({ method: 'GET', url });
      samples.push(performance.now() - t0);
      expect(res.statusCode).toBe(200);
    }
    return p95(samples);
  }

  it('GET /agents/performance: p95 <= 500 ms for 30 and 366 days (NFR-1)', async () => {
    expect(await measure(`/agents/performance?${period(30)}`)).toBeLessThanOrEqual(BUDGET_MS);
    expect(await measure(`/agents/performance?${period(366)}`)).toBeLessThanOrEqual(BUDGET_MS);
  });

  it('GET /agents/:id/stats and /stats/runs: p95 <= 500 ms (NFR-2)', async () => {
    const id = data.agentIds[0]!;
    expect(await measure(`/agents/${id}/stats?${period(366)}`)).toBeLessThanOrEqual(BUDGET_MS);
    expect(await measure(`/agents/${id}/stats/runs?${period(366)}&page=1`)).toBeLessThanOrEqual(BUDGET_MS);
  });
});
