import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const CASES = 200;
const RUNS = 50;
const SAMPLES = 20;
const BUDGET_MS = 300;

const p95 = (ms: number[]) => [...ms].sort((a, b) => a - b)[Math.ceil(ms.length * 0.95) - 1]!;

/** NFR-1: the three read endpoints stay under 300 ms (p95) at 200 cases x 50 runs. */
d('eval read performance (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const [agent] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'perf-agent',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'p',
      })
      .returning();
    agentId = agent!.id;

    const cases = await db
      .insert(t.evalCases)
      .values(
        Array.from({ length: CASES }, (_, i) => ({
          workspaceId,
          ownerKind: 'agent' as const,
          ownerId: agentId,
          agentId,
          name: `perf-case-${i}`,
          type: 'must_find' as const,
          inputDiff: 'diff --git a/a.ts b/a.ts',
          inputMeta: { pr_title: 't', pr_body: null, pr_number: 1, repo_full_name: null },
          expectations: [{ file: 'a.ts', start_line: 1, end_line: 1, severity: null, category: null, title: null }],
          diffSource: 'manual',
        })),
      )
      .returning({ id: t.evalCases.id, name: t.evalCases.name });

    for (let r = 0; r < RUNS; r++) {
      const startedAt = new Date(Date.UTC(2026, 0, 1, 0, r));
      const [run] = await db
        .insert(t.evalSuiteRuns)
        .values({
          workspaceId,
          agentId,
          status: 'completed',
          agentVersion: 1,
          config: { provider: 'openai', model: 'gpt-4.1', strategy: 'single-pass', system_prompt: 'p', skills: [], temperature: 0 },
          caseIds: cases.map((c) => c.id),
          casesTotal: CASES,
          casesCompleted: CASES,
          casesPassed: CASES / 2,
          recall: 0.5,
          precision: 0.5,
          citationAccuracy: 1,
          startedAt,
          finishedAt: startedAt,
        })
        .returning({ id: t.evalSuiteRuns.id });
      await db.insert(t.evalRuns).values(
        cases.map((c, i) => ({
          caseId: c.id,
          suiteRunId: run!.id,
          caseName: c.name,
          status: i % 2 === 0 ? ('pass' as const) : ('fail' as const),
          expectedCount: 1,
          actualCount: 1,
          ranAt: startedAt,
        })),
      );
    }

    app = await buildApp({
      config: config(),
      db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: '' }) },
    });
  }, 180_000);
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function measure(url: string): Promise<number> {
    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      const res = await app.inject({ method: 'GET', url });
      samples.push(performance.now() - t0);
      expect(res.statusCode).toBe(200);
    }
    return p95(samples);
  }

  it('GET eval-cases, GET eval-runs and GET /eval/overview: p95 <= 300 ms (NFR-1)', async () => {
    await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` }); // warm up
    const cases = await measure(`/agents/${agentId}/eval-cases`);
    const runs = await measure(`/agents/${agentId}/eval-runs`);
    const overview = await measure('/eval/overview');
    expect(cases).toBeLessThanOrEqual(BUDGET_MS);
    expect(runs).toBeLessThanOrEqual(BUDGET_MS);
    expect(overview).toBeLessThanOrEqual(BUDGET_MS);
  });
});
