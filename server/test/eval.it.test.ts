import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockEmbedder,
  MockGitClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,\n   z: 1,';
const DIFF = `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`;

const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed.',
      suggestion: null,
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

/** Answers after a delay, so a run stays `running` long enough to race against. */
class SlowLLM implements LLMProvider {
  readonly id = 'anthropic' as const;
  constructor(private ms: number) {}
  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error('not used');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    await new Promise((r) => setTimeout(r, this.ms));
    return {
      data: REVIEW as unknown as T,
      model: req.model,
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0.001,
      raw: '{}',
      attempts: 1,
    };
  }
  async embed(): Promise<number[][]> {
    return [];
  }
}

let seq = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;

d('eval API (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: PgFixture['handle']['db'];
  let workspaceId: string;
  let app: FastifyInstance; // openai -> fast mock, anthropic -> SlowLLM(400ms)
  let noKeyApp: FastifyInstance; // no providers, no secrets: every review is missing_key

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({
      config: config(),
      db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        secrets: new MockSecretsProvider({}),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW }),
          anthropic: new SlowLLM(400),
        },
      },
    });
    noKeyApp = await buildApp({
      config: config(),
      db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        secrets: new MockSecretsProvider({}),
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await noKeyApp?.close();
    await pg?.stop();
  });

  // ---- fixtures ---------------------------------------------------------------

  async function mkAgent(provider: 'openai' | 'anthropic' = 'openai', ws = workspaceId) {
    const [a] = await db
      .insert(t.agents)
      .values({
        workspaceId: ws,
        name: uniq('eval-agent'),
        provider,
        model: provider === 'openai' ? 'gpt-4.1' : 'claude-x',
        systemPrompt: 'You review code.',
      })
      .returning();
    return a!;
  }

  /** repo + PR (+ pr_files) + optional run trace + review (+ agent) + one finding. */
  async function mkFinding(
    agentId: string | null,
    opts: {
      triage?: 'accepted' | 'dismissed' | null;
      withTrace?: boolean;
      line?: number;
      ws?: string;
    } = {},
  ) {
    const ws = opts.ws ?? workspaceId;
    const name = uniq('repo');
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 482,
        title: 'Add config',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
        lastReviewedSha: 'reviewed-sha',
        body: 'PR body',
      })
      .returning();
    await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/config.ts', patch: PATCH });

    let runId: string | null = null;
    if (opts.withTrace) {
      const [run] = await db
        .insert(t.agentRuns)
        .values({ workspaceId: ws, prId: pr!.id, status: 'done' })
        .returning();
      runId = run!.id;
      await db.insert(t.runTraces).values({
        runId,
        trace: {
          prompt_assembly: {
            user: `## Diff to review\n<untrusted source="diff">\n${DIFF}\n</untrusted>`,
          },
        },
      });
    }
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId: ws, prId: pr!.id, agentId, runId, kind: 'review', model: 'm' })
      .returning();
    const line = opts.line ?? 11;
    const triage = opts.triage === undefined ? 'accepted' : opts.triage;
    const [finding] = await db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: line,
        endLine: line,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        rationale: 'r',
        confidence: 0.9,
        acceptedAt: triage === 'accepted' ? new Date() : null,
        dismissedAt: triage === 'dismissed' ? new Date() : null,
      })
      .returning();
    return { repo: repo!, pr: pr!, review: review!, finding: finding! };
  }

  const caseBody = (name: string, over: Record<string, unknown> = {}) => ({
    name,
    type: 'must_find',
    input_diff: DIFF,
    input_meta: { pr_title: 'Add config', pr_body: 'PR body', pr_number: 482, repo_full_name: 'acme/x' },
    expectations: [
      { file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'security', title: null },
    ],
    source_finding_id: null,
    diff_source: 'manual',
    notes: null,
    ...over,
  });

  async function mkCase(a: FastifyInstance, agentId: string, over: Record<string, unknown> = {}) {
    const res = await a.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-cases`,
      payload: caseBody(uniq('case'), over),
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  async function waitRun(a: FastifyInstance, runId: string, timeoutMs = 15_000) {
    const start = Date.now();
    for (;;) {
      const res = await a.inject({ method: 'GET', url: `/eval-runs/${runId}` });
      const run = res.json();
      if (!['queued', 'running'].includes(run.status)) return run;
      if (Date.now() - start > timeoutMs) throw new Error(`run ${runId} did not finish`);
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  const counts = async () => {
    const one = async (table: string) =>
      Number((await db.execute(sql.raw(`select count(*)::int as n from ${table}`)))[0]!.n);
    return { reviews: await one('reviews'), findings: await one('findings'), runs: await one('agent_runs') };
  };

  // ---- draft ------------------------------------------------------------------

  it('draft: accepted -> must_find from current pr_files; a trace gives run_trace; dismissed -> must_not_flag (AC-6, AC-11, AC-12)', async () => {
    const agent = await mkAgent();
    const plain = await mkFinding(agent.id);
    const res = await app.inject({ method: 'GET', url: `/findings/${plain.finding.id}/eval-draft` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      type: 'must_find',
      diff_source: 'current_pr_files',
      owner_id: agent.id,
      source_finding_id: plain.finding.id,
      existing_case: null,
    });

    const traced = await mkFinding(agent.id, { withTrace: true });
    expect((await app.inject({ method: 'GET', url: `/findings/${traced.finding.id}/eval-draft` })).json()).toMatchObject({
      diff_source: 'run_trace',
    });

    const dismissed = await mkFinding(agent.id, { triage: 'dismissed' });
    expect((await app.inject({ method: 'GET', url: `/findings/${dismissed.finding.id}/eval-draft` })).json()).toMatchObject({
      type: 'must_not_flag',
    });
  });

  it('draft errors: untriaged, no hunk, orphan agent (AC-14, EC-2)', async () => {
    const agent = await mkAgent();
    const open = await mkFinding(agent.id, { triage: null });
    const r1 = await app.inject({ method: 'GET', url: `/findings/${open.finding.id}/eval-draft` });
    expect(r1.statusCode).toBe(422);
    expect(r1.json().error.code).toBe('finding_untriaged');

    const far = await mkFinding(agent.id, { line: 500 });
    const r2 = await app.inject({ method: 'GET', url: `/findings/${far.finding.id}/eval-draft` });
    expect(r2.statusCode).toBe(422);
    expect(r2.json().error.code).toBe('diff_unavailable');

    const orphan = await mkFinding(null);
    const r3 = await app.inject({ method: 'GET', url: `/findings/${orphan.finding.id}/eval-draft` });
    expect(r3.statusCode).toBe(422);
    expect(r3.json().error.code).toBe('agent_missing');
  });

  // ---- cases ------------------------------------------------------------------

  it('case CRUD: create from a draft, duplicate name, bad range, update, delete (AC-16, AC-48, AC-50, AC-52, AC-63, AC-140)', async () => {
    const agent = await mkAgent();
    const f = await mkFinding(agent.id);
    const draft = (await app.inject({ method: 'GET', url: `/findings/${f.finding.id}/eval-draft` })).json();

    const { owner_id: _o, owner_name: _n, existing_case: _e, ...body } = draft;
    void _o; void _n; void _e;
    const created = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: body });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      type: 'must_find',
      source_finding_id: f.finding.id,
      owner_kind: 'agent',
      owner_id: agent.id,
      last_result: null,
      source: { finding_title: 'Hardcoded Stripe secret key', pr_number: 482, triage: 'accepted' },
    });
    const caseId = created.json().id as string;

    // the next draft of the same finding points at the saved case (AC-16)
    const again = await app.inject({ method: 'GET', url: `/findings/${f.finding.id}/eval-draft` });
    expect(again.json().existing_case).toMatchObject({ id: caseId });

    const dup = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: body });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('name_taken');

    const bad = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-cases`,
      payload: caseBody(uniq('bad'), {
        expectations: [{ file: 'src/config.ts', start_line: 12, end_line: 11, severity: null, category: null, title: null }],
      }),
    });
    expect(bad.statusCode).toBe(422);

    const put = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${caseId}`,
      payload: { ...body, name: uniq('renamed'), notes: 'edited' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ id: caseId, notes: 'edited', source_finding_id: f.finding.id });

    // re-triage after save does not change the case (AC-135, EC-2)
    await db.update(t.findings).set({ acceptedAt: null, dismissedAt: new Date() }).where(eq(t.findings.id, f.finding.id));
    const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0]).toMatchObject({ id: caseId, type: 'must_find' });

    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${caseId}` })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json()).toEqual([]);
  });

  it('rejects the 201st case of an agent (NFR-3)', async () => {
    const agent = await mkAgent();
    await db.insert(t.evalCases).values(
      Array.from({ length: 200 }, (_, i) => ({
        workspaceId,
        ownerKind: 'agent' as const,
        ownerId: agent.id,
        agentId: agent.id,
        name: `bulk-${i}`,
        type: 'must_find' as const,
      })),
    );
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-cases`,
      payload: caseBody(uniq('201st')),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('case_limit');
  });

  // ---- attempts + suite runs ------------------------------------------------------

  it('attempt: 202, poll to done, no reviews / findings / agent_runs written (AC-57, AC-167, AC-168)', async () => {
    const agent = await mkAgent();
    const f = await mkFinding(agent.id);
    const before = await counts();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-attempts`,
      payload: caseBody(uniq('attempt')),
    });
    expect(res.statusCode).toBe(202);
    const id = res.json().attempt_id as string;
    let attempt = (await app.inject({ method: 'GET', url: `/eval-attempts/${id}` })).json();
    for (let i = 0; i < 100 && attempt.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 30));
      attempt = (await app.inject({ method: 'GET', url: `/eval-attempts/${id}` })).json();
    }
    expect(attempt.status).toBe('done');
    expect(attempt.result).toMatchObject({ status: 'pass', error_reason: null });
    expect(await counts()).toEqual(before);
    const [pr] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.id, f.pr.id));
    expect(pr!.lastReviewedSha).toBe('reviewed-sha');

    const missing = await app.inject({ method: 'GET', url: '/eval-attempts/00000000-0000-4000-8000-000000000000' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('attempt_not_found');
  });

  it('suite run: 422 without cases; pinned config; per-case rows; deleting a case keeps run metrics (AC-72, AC-73, AC-80, AC-65, AC-89, EC-23)', async () => {
    const agent = await mkAgent();
    const none = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(none.statusCode).toBe(422);
    expect(none.json().error.code).toBe('no_cases');

    const c1 = await mkCase(app, agent.id);
    await mkCase(app, agent.id, { type: 'must_not_flag' });
    const before = await counts();
    const start = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(start.statusCode).toBe(202);
    const run = await waitRun(app, start.json().run_id);
    expect(run).toMatchObject({
      status: 'completed',
      agent_version: 1,
      cases_total: 2,
      cases_passed: 1, // the must_not_flag case sees the forbidden finding at line 11
      recall: 1,
      config: { provider: 'openai', model: 'gpt-4.1', strategy: 'single-pass', system_prompt: 'You review code.', skills: [] },
    });
    expect(run.per_case).toHaveLength(2);
    expect(await counts()).toEqual(before); // AC-167, AC-168

    await app.inject({ method: 'DELETE', url: `/eval-cases/${c1.id}` });
    const after = (await app.inject({ method: 'GET', url: `/eval-runs/${run.id}` })).json();
    expect(after.recall).toBe(run.recall);
    expect(after.cases_total).toBe(2);
    expect(after.per_case).toHaveLength(1);

    const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` });
    expect(list.json()[0]).not.toHaveProperty('per_case');
    expect(list.json()[0].config).not.toHaveProperty('system_prompt');
  });

  it('two parallel starts: one 202 and one 409 run_active with the active run id (AC-82, EC-14, NFR-3)', async () => {
    const agent = await mkAgent('anthropic');
    await mkCase(app, agent.id);
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` }),
      app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([202, 409]);
    const accepted = a.statusCode === 202 ? a : b;
    const rejected = a.statusCode === 409 ? a : b;
    expect(rejected.json().error.code).toBe('run_active');
    expect(rejected.json().error.details.active_run_id).toBe(accepted.json().run_id);
    await waitRun(app, accepted.json().run_id);
  });

  it('cancel an active run (AC-91); cancelling a finished run is 409 not_running', async () => {
    const agent = await mkAgent('anthropic');
    await mkCase(app, agent.id);
    await mkCase(app, agent.id);
    const { run_id } = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
    const cancelled = await app.inject({ method: 'POST', url: `/eval-runs/${run_id}/cancel` });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({ status: 'cancelled', recall: null, precision: null });
    const again = await app.inject({ method: 'POST', url: `/eval-runs/${run_id}/cancel` });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('not_running');
    await new Promise((r) => setTimeout(r, 900)); // the in-flight case settles; the run stays cancelled
    expect((await app.inject({ method: 'GET', url: `/eval-runs/${run_id}` })).json().status).toBe('cancelled');
  });

  it('missing key: cases error, the run fails with null metrics (AC-161, AC-162)', async () => {
    const agent = await mkAgent('openai');
    await mkCase(noKeyApp, agent.id);
    const { run_id } = (await noKeyApp.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
    const run = await waitRun(noKeyApp, run_id);
    expect(run).toMatchObject({ status: 'failed', recall: null, precision: null, cases_passed: null });
    expect(run.per_case[0]).toMatchObject({ status: 'error', error_reason: 'missing_key' });
  });

  // ---- boot sweep, overview, compare ------------------------------------------------

  it('boot sweep: a run left running becomes interrupted with null metrics (AC-87, EC-18)', async () => {
    const agent = await mkAgent();
    const [row] = await db
      .insert(t.evalSuiteRuns)
      .values({ workspaceId, agentId: agent.id, status: 'running', recall: 0.5, precision: 0.5, citationAccuracy: 1 })
      .returning();
    const rebooted = await buildApp({
      config: config(),
      db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: DIFF }) },
    });
    try {
      const run = (await rebooted.inject({ method: 'GET', url: `/eval-runs/${row!.id}` })).json();
      expect(run).toMatchObject({ status: 'interrupted', recall: null, precision: null, citation_accuracy: null });
      expect(run.finished_at).not.toBeNull();
    } finally {
      await rebooted.close();
    }
  });

  async function insertRun(agentId: string, startedAt: Date, over: Partial<typeof t.evalSuiteRuns.$inferInsert> = {}) {
    const [r] = await db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId,
        status: 'completed',
        agentVersion: 1,
        config: { provider: 'openai', model: 'gpt-4.1', strategy: 'single-pass', system_prompt: 'P', skills: [], temperature: 0 },
        caseIds: [],
        recall: 0.5,
        precision: 0.5,
        citationAccuracy: 1,
        startedAt,
        finishedAt: startedAt,
        ...over,
      })
      .returning();
    return r!;
  }

  it('overview: at most 6 recent runs, newest first (AC-105)', async () => {
    const agent = await mkAgent();
    for (let i = 0; i < 8; i++) await insertRun(agent.id, new Date(Date.UTC(2031, 0, 1 + i)));
    const res = await app.inject({ method: 'GET', url: '/eval/overview' });
    expect(res.statusCode).toBe(200);
    const recent = res.json().recent_runs as Array<{ started_at: string; agent_name: string }>;
    expect(recent.length).toBeLessThanOrEqual(6);
    const times = recent.map((r) => Date.parse(r.started_at));
    expect(times).toEqual([...times].sort((x, y) => y - x));
    expect(recent[0]!.agent_name).toBe(agent.name);
    const entry = (res.json().agents as Array<{ agent_id: string; recall_trend: number[] }>).find((a) => a.agent_id === agent.id);
    expect(entry!.recall_trend).toHaveLength(8);
  });

  it('compare: same agent -> case_set + flips; other agent -> 422 different_agents; failed run -> 422 no_metrics (AC-127, AC-130, AC-165)', async () => {
    const agent = await mkAgent();
    const other = await mkAgent();
    const c1 = await mkCase(app, agent.id);
    const c2 = await mkCase(app, agent.id);
    const older = await insertRun(agent.id, new Date(Date.UTC(2030, 0, 1)), { caseIds: [c1.id, c2.id] });
    const newer = await insertRun(agent.id, new Date(Date.UTC(2030, 0, 2)), { caseIds: [c1.id] });
    const foreign = await insertRun(other.id, new Date(Date.UTC(2030, 0, 3)));
    const failed = await insertRun(agent.id, new Date(Date.UTC(2030, 0, 4)), { status: 'failed', recall: null });
    await db.insert(t.evalRuns).values([
      { caseId: c1.id, suiteRunId: older.id, status: 'pass', caseName: c1.name },
      { caseId: c1.id, suiteRunId: newer.id, status: 'fail', caseName: c1.name },
    ]);

    const ok = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${newer.id}&b=${older.id}` });
    expect(ok.statusCode).toBe(200);
    const cmp = ok.json();
    expect(cmp.a.id).toBe(older.id);
    expect(cmp.case_set).toEqual({ added: [], removed: [c2.id] });
    expect(cmp.flips.find((f: { case_id: string }) => f.case_id === c1.id)).toMatchObject({ a: 'pass', b: 'fail', flip: 'pass_to_fail' });
    expect(cmp.identical_config).toBe(true);

    const diffAgents = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${older.id}&b=${foreign.id}` });
    expect(diffAgents.statusCode).toBe(422);
    expect(diffAgents.json().error.code).toBe('different_agents');
    const noMetrics = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${older.id}&b=${failed.id}` });
    expect(noMetrics.statusCode).toBe(422);
    expect(noMetrics.json().error.code).toBe('no_metrics');
  });

  // ---- workspace scope, cascade, compatibility ----------------------------------------

  it('a foreign workspace id is a 404 on every endpoint (AC-133, NFR-8)', async () => {
    const [ws2] = await db.insert(t.workspaces).values({ name: uniq('other-ws') }).returning();
    const foreignAgent = await mkAgent('openai', ws2!.id);
    const [fcase] = await db
      .insert(t.evalCases)
      .values({
        workspaceId: ws2!.id,
        ownerKind: 'agent',
        ownerId: foreignAgent.id,
        agentId: foreignAgent.id,
        name: uniq('foreign'),
        type: 'must_find',
        inputDiff: DIFF,
        inputMeta: {},
        expectations: [],
      })
      .returning();
    const frun = await insertRun(foreignAgent.id, new Date());
    await db.update(t.evalSuiteRuns).set({ workspaceId: ws2!.id }).where(eq(t.evalSuiteRuns.id, frun.id));
    const ff = await mkFinding(foreignAgent.id, { ws: ws2!.id });

    const probes: Array<[string, string, unknown?]> = [
      ['GET', `/findings/${ff.finding.id}/eval-draft`],
      ['GET', `/agents/${foreignAgent.id}/eval-cases`],
      ['POST', `/agents/${foreignAgent.id}/eval-cases`, caseBody(uniq('x'))],
      ['PUT', `/eval-cases/${fcase!.id}`, caseBody(uniq('x'))],
      ['DELETE', `/eval-cases/${fcase!.id}`],
      ['POST', `/eval-cases/${fcase!.id}/attempts`],
      ['POST', `/agents/${foreignAgent.id}/eval-attempts`, caseBody(uniq('x'))],
      ['POST', `/agents/${foreignAgent.id}/eval-runs`],
      ['GET', `/agents/${foreignAgent.id}/eval-runs`],
      ['GET', `/eval-runs/${frun.id}`],
      ['POST', `/eval-runs/${frun.id}/cancel`],
    ];
    for (const [method, url, payload] of probes) {
      const res = await app.inject({ method: method as 'GET', url, ...(payload ? { payload: payload as object } : {}) });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
  });

  it('deleting an agent removes its cases and runs (AC-132, EC-24)', async () => {
    const agent = await mkAgent();
    const c = await mkCase(app, agent.id);
    const run = await insertRun(agent.id, new Date());
    await db.insert(t.evalRuns).values({ caseId: c.id, suiteRunId: run.id, status: 'pass' });
    const del = await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` });
    expect(del.statusCode).toBe(200);
    expect(await db.select().from(t.evalCases).where(eq(t.evalCases.id, c.id))).toHaveLength(0);
    expect(await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, agent.id))).toHaveLength(0);
    expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.suiteRunId, run.id))).toHaveLength(0);
  });

  it('existing responses keep their shape (NFR-15)', async () => {
    const agent = await mkAgent();
    const f = await mkFinding(agent.id, { triage: null });
    const agents = await app.inject({ method: 'GET', url: '/agents' });
    expect(Object.keys(agents.json()[0]).sort()).toEqual(
      expect.arrayContaining(['id', 'name', 'provider', 'model', 'system_prompt', 'version']),
    );
    const accept = await app.inject({ method: 'POST', url: `/findings/${f.finding.id}/accept` });
    expect(accept.statusCode).toBe(200);
    expect(Object.keys(accept.json())).toEqual(['finding']);
    expect(accept.json().finding).toMatchObject({ id: f.finding.id, review_id: f.review.id });
    expect(accept.json().finding.accepted_at).not.toBeNull();
  });

  it('run-all starts one run per agent that has cases and no active run (AC-114)', async () => {
    const agent = await mkAgent();
    await mkCase(app, agent.id);
    const res = await app.inject({ method: 'POST', url: '/eval/run-all' });
    expect(res.statusCode).toBe(202);
    const ids = res.json().run_ids as string[];
    expect(ids.length).toBeGreaterThanOrEqual(1);
    const runs = await Promise.all(ids.map((id) => waitRun(app, id)));
    expect(runs.some((r) => r.agent_id === agent.id)).toBe(true);
  });
});
