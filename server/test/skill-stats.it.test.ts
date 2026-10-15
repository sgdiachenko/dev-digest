import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';
import { SkillStats } from '../src/vendor/shared/index.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** Two findings so accept/dismiss produces a non-trivial accept rate. */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Two issues.',
  score: 50,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded secret',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A secret is committed.',
      confidence: 0.9,
      kind: 'finding',
    },
    {
      id: 'f2',
      severity: 'WARNING',
      category: 'bug',
      title: 'Missing null check',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'redisUrl may be undefined.',
      confidence: 0.7,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `skill-stats-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Add config',
      author: 'burnjohn',
      branch: 'feat/config',
      base: 'main',
      headSha: 'deadbeef',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

/**
 * The Skill Editor's Stats tab (T32) — every figure derived from `agent_skills`
 * / `agent_runs` / `run_traces.config.skills` / `reviews` / `findings`, no
 * separate analytics table. Rules are the agent-performance ones: counted local
 * runs, decided findings at their current decision, null (not 0%) without data.
 * Runs, traces, reviews and findings are inserted directly so every case pins
 * its own `ranAt` and recorded skill list.
 */
d('Skill Stats tab (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let llm: MockLLMProvider;
  let seq = 0;

  const DAY = 86_400_000;
  const NOW = Date.now();
  /** A fixed past period so the skill and agent reads cover identical rows. */
  const FROM = new Date(NOW - 20 * DAY);
  const TO = new Date(NOW - 10 * DAY);
  const inPeriod = (offsetMs: number) => new Date(FROM.getTime() + 1000 + offsetMs);
  const periodQs = (from = FROM, to = TO) => new URLSearchParams({ from: from.toISOString(), to: to.toISOString() }).toString();

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith() {
    llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient({ diff: DIFF }), llm: { openai: llm } },
    });
  }

  const uniq = (base: string) => `${base}-${++seq}-${randomUUID().slice(0, 6)}`;

  async function newSkill(enabled = true) {
    const [row] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name: uniq('stats-skill'), description: 'd', type: 'custom', source: 'manual', body: '# Rule\nx', enabled })
      .returning();
    return row!;
  }
  async function newAgent(label = 'agent') {
    const [row] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: uniq(label), provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x' })
      .returning();
    return row!;
  }
  async function link(agentId: string, skillId: string) {
    await pg.handle.db.insert(t.agentSkills).values({ agentId, skillId });
  }

  interface FindingSeed {
    category: string;
    accepted?: boolean;
    dismissed?: boolean;
  }
  let prSeq = 0;
  let prId: string | undefined;
  async function ensurePr() {
    if (prId) return prId;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    prId = pr.id;
    return prId;
  }

  /** One run (+ trace, + optional review with findings) at an exact time. */
  async function seedRun(opts: {
    agentId: string | null;
    ranAt: Date;
    status?: 'done' | 'failed' | 'cancelled' | 'running';
    source?: 'local' | 'ci';
    skills?: unknown;
    findings?: FindingSeed[];
    withReview?: boolean;
  }) {
    const db = pg.handle.db;
    const status = opts.status ?? 'done';
    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: opts.agentId,
        prId: await ensurePr(),
        ranAt: opts.ranAt,
        status,
        source: opts.source ?? 'local',
        costUsd: null,
      })
      .returning();
    if (opts.skills !== undefined) {
      await db.insert(t.runTraces).values({
        runId: run!.id,
        trace: { config: { agent: opts.agentId, skills: opts.skills } },
      });
    }
    if (opts.findings || opts.withReview) {
      const [review] = await db
        .insert(t.reviews)
        .values({
          workspaceId,
          prId: await ensurePr(),
          agentId: opts.agentId,
          runId: run!.id,
          kind: 'review',
          verdict: 'comment',
          summary: 's',
          score: 80,
          model: 'seed',
        })
        .returning();
      for (const f of opts.findings ?? []) {
        await db.insert(t.findings).values({
          reviewId: review!.id,
          file: 'src/config.ts',
          startLine: ++prSeq,
          endLine: prSeq,
          severity: 'WARNING',
          category: f.category,
          title: 'seeded',
          rationale: 'seeded',
          confidence: 0.9,
          acceptedAt: f.accepted ? new Date(NOW) : null,
          dismissedAt: f.dismissed ? new Date(NOW) : null,
        });
      }
    }
    return run!;
  }

  async function statsOf(app: Awaited<ReturnType<typeof appWith>>, skillId: string, qs = periodQs()) {
    const res = await app.inject({ method: 'GET', url: `/skills/${skillId}/stats?${qs}` });
    expect(res.statusCode).toBe(200);
    return SkillStats.parse(res.json());
  }

  it('a freshly-linked, never-run skill reports null pull/accept rates, not 0% (AC-2, EC-20)', async () => {
    const app = await appWith();
    const skill = await newSkill();
    const agent = await newAgent('Unused Agent');
    await link(agent.id, skill.id);
    const stats = await statsOf(app, skill.id);
    expect(stats.agent_count).toBe(1);
    expect(stats.agents).toEqual([{ id: agent.id, name: agent.name }]);
    expect(stats).toMatchObject({
      pull_pct: null,
      pull_runs: 0,
      pull_runs_total: 0,
      accept_pct: null,
      accept_rate: null,
      findings: 0,
      findings_30d: 0,
      skill_runs: 0,
      last_used_at: null,
    });
    await app.close();
  });

  it('AC-1..AC-7: pull base, runs without skill data, findings of any agent, decisions and last_used_at', async () => {
    const app = await appWith();
    const skill = await newSkill();
    const a = await newAgent('b-agent');
    const b = await newAgent('a-agent');
    const gone = await newAgent('unlinked-agent');
    await link(a.id, skill.id);
    await link(b.id, skill.id);

    const loaded = [skill.id];
    // linked agent a: two runs that loaded the skill, one that recorded [] (EC-6), one failed (no list)
    const r1 = await seedRun({ agentId: a.id, ranAt: inPeriod(0), skills: loaded, findings: [{ category: 'security', accepted: true }, { category: 'bug', dismissed: true }] });
    await seedRun({ agentId: a.id, ranAt: inPeriod(1000), skills: loaded, findings: [{ category: 'security' }] });
    await seedRun({ agentId: a.id, ranAt: inPeriod(2000), skills: [] });
    await seedRun({ agentId: a.id, ranAt: inPeriod(3000), status: 'failed' });
    // linked agent b: a run recorded before it was linked (EC-1) and one with no trace at all (EC-7)
    await seedRun({ agentId: b.id, ranAt: inPeriod(4000), skills: ['someone-else'] });
    await seedRun({ agentId: b.id, ranAt: inPeriod(5000) });
    // unlinked agent and a deleted agent both ran with the skill (EC-2, EC-3)
    await seedRun({ agentId: gone.id, ranAt: inPeriod(6000), skills: loaded, findings: [{ category: 'style', accepted: true }] });
    await seedRun({ agentId: null, ranAt: inPeriod(7000), skills: loaded, findings: [{ category: 'style' }] });
    // a failed skill run does not feed findings even with a review
    await seedRun({ agentId: gone.id, ranAt: inPeriod(8000), status: 'failed', skills: loaded, findings: [{ category: 'bug' }] });
    // outside the period (EC-14): at `to`, and before `from`; the earlier one sets nothing, the later one last_used_at
    const lateRun = await seedRun({ agentId: a.id, ranAt: TO, skills: loaded });
    await seedRun({ agentId: a.id, ranAt: new Date(FROM.getTime() - 1), skills: loaded });

    const s = await statsOf(app, skill.id);
    expect(s.agents.map((x) => x.name)).toEqual([b.name, a.name].sort());
    // pull base = linked agents' runs with a recorded list: a: 3 (two loaded + []), b: 1 -> 4
    expect(s.pull_runs_total).toBe(4);
    expect(s.pull_runs).toBe(2);
    expect(s.pull_pct).toBe(50);
    // linked runs without a list: a's failed run, b's trace-less run
    expect(s.runs_without_skill_data).toBe(2);
    // skill runs in the period (any agent, any counted status)
    expect(s.skill_runs).toBe(5);
    // findings of the done skill runs only
    expect(s.findings).toBe(5);
    expect(s.by_category).toEqual([
      { category: 'security', count: 2 },
      { category: 'style', count: 2 },
      { category: 'bug', count: 1 },
    ]);
    expect([s.accepted, s.dismissed, s.pending]).toEqual([2, 1, 2]);
    expect(s.accept_rate).toBeCloseTo(2 / 3);
    expect(s.accept_pct).toBe(67);
    expect(s.small_sample).toBe(true);
    expect(s.last_used_at).toBe(lateRun.ranAt.toISOString());
    expect(r1.id).toBeTruthy();
    // NFR-6 invariants
    expect(s.by_category.reduce((n, c) => n + c.count, 0)).toBe(s.findings);
    expect(s.accepted + s.dismissed + s.pending).toBe(s.findings);
    expect(s.findings_30d).toBe(s.findings);
    await app.close();
  });

  it('AC-8: no period answers 200 over the last 30 days with every old key; AC-10 unknown skill is 404', async () => {
    const app = await appWith();
    const skill = await newSkill();
    const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const k of ['agent_count', 'agents', 'pull_pct', 'accept_pct', 'findings_30d', 'by_category']) {
      expect(body).toHaveProperty(k);
    }
    expect(Date.parse(body.period.to) - Date.parse(body.period.from)).toBe(30 * DAY);
    expect(body.period.to).toBe(body.as_of);
    expect(body.findings_30d).toBe(body.findings);
    expect((await app.inject({ method: 'GET', url: `/skills/${randomUUID()}/stats` })).statusCode).toBe(404);
    await app.close();
  });

  it('AC-10 / EC-15: a skill of another workspace is 404', async () => {
    const app = await appWith();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: uniq('other-ws') } as typeof t.workspaces.$inferInsert).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId: otherWs!.id, name: uniq('foreign'), description: 'd', type: 'custom', source: 'manual', body: 'x' })
      .returning();
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign!.id}/stats` })).statusCode).toBe(404);
    await app.close();
  });

  it('AC-11: GET /skills rows carry stats over a 720h card period', async () => {
    const app = await appWith();
    const skill = await newSkill();
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{ id: string; stats: SkillStats }>;
    const row = list.find((s) => s.id === skill.id)!;
    expect(Date.parse(row.stats.period.to) - Date.parse(row.stats.period.from)).toBe(30 * DAY);
    expect(row.stats).toMatchObject({ agent_count: 0, pull_pct: null, accept_pct: null });
    await app.close();
  });

  it('AC-12 / NFR-4 / EC-19: reading stats makes no LLM call, no fetch and starts no run', async () => {
    const app = await appWith();
    const skill = await newSkill();
    const agent = await newAgent();
    await link(agent.id, skill.id);
    await seedRun({ agentId: agent.id, ranAt: inPeriod(0), skills: [skill.id] });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const runsBefore = (await pg.handle.db.select().from(t.agentRuns)).length;
    const callsBefore = llm.calls.length;
    await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats?${periodQs()}` });
    await app.inject({ method: 'GET', url: '/skills' });
    expect(llm.calls.length).toBe(callsBefore);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await pg.handle.db.select().from(t.agentRuns)).length).toBe(runsBefore);
    fetchSpy.mockRestore();
    await app.close();
  });

  it('EC-8 / EC-9: running runs and CI runs are in no figure', async () => {
    const app = await appWith();
    const skill = await newSkill();
    const agent = await newAgent();
    await link(agent.id, skill.id);
    await seedRun({ agentId: agent.id, ranAt: inPeriod(0), status: 'running', skills: [skill.id], findings: [{ category: 'bug' }] });
    await seedRun({ agentId: agent.id, ranAt: inPeriod(1000), source: 'ci', skills: [skill.id], findings: [{ category: 'bug' }] });
    const s = await statsOf(app, skill.id);
    expect(s).toMatchObject({ pull_runs_total: 0, skill_runs: 0, findings: 0, runs_without_skill_data: 0, last_used_at: null });
    await app.close();
  });

  it('EC-10 / EC-11: a run-less review is not counted; a re-triage is counted at read time', async () => {
    const app = await appWith();
    const skill = await newSkill();
    const agent = await newAgent();
    await link(agent.id, skill.id);
    // a review with no run (like the seeded eval review)
    const [orphan] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: await ensurePr(), agentId: agent.id, runId: null, kind: 'review', verdict: 'comment', summary: 's', score: 1, model: 'x' })
      .returning();
    await pg.handle.db.insert(t.findings).values({ reviewId: orphan!.id, file: 'a', startLine: 1, endLine: 1, severity: 'WARNING', category: 'bug', title: 't', rationale: 'r', confidence: 0.5 });
    const run = await seedRun({ agentId: agent.id, ranAt: inPeriod(0), skills: [skill.id], findings: [{ category: 'bug', accepted: true }] });
    let s = await statsOf(app, skill.id);
    expect(s.findings).toBe(1);
    expect(s.accepted).toBe(1);
    // re-triage accepted -> dismissed
    const [review] = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.runId, run.id));
    await pg.handle.db.update(t.findings).set({ acceptedAt: null, dismissedAt: new Date(NOW) }).where(eq(t.findings.reviewId, review!.id));
    s = await statsOf(app, skill.id);
    expect([s.accepted, s.dismissed]).toEqual([0, 1]);
    await app.close();
  });

  it('EC-27 / NFR-6: a malformed recorded skill list answers 200 and counts as no skill data; repeated reads are equal', async () => {
    const app = await appWith();
    const skill = await newSkill();
    const agent = await newAgent();
    await link(agent.id, skill.id);
    await seedRun({ agentId: agent.id, ranAt: inPeriod(0), skills: ['x', 1] });
    await seedRun({ agentId: agent.id, ranAt: inPeriod(1000), skills: { not: 'a list' } });
    await seedRun({ agentId: agent.id, ranAt: inPeriod(2000), skills: [skill.id] });
    const first = await statsOf(app, skill.id);
    expect(first.runs_without_skill_data).toBe(2);
    expect(first.pull_runs_total).toBe(1);
    const second = await statsOf(app, skill.id);
    expect({ ...second, as_of: '' }).toEqual({ ...first, as_of: '' });
    await app.close();
  });

  it('AC-4 / EC-13: two agents flagging the same issue count twice', async () => {
    const app = await appWith();
    const skill = await newSkill();
    const a = await newAgent();
    const b = await newAgent();
    await link(a.id, skill.id);
    await link(b.id, skill.id);
    await seedRun({ agentId: a.id, ranAt: inPeriod(0), skills: [skill.id], findings: [{ category: 'bug' }] });
    await seedRun({ agentId: b.id, ranAt: inPeriod(10), skills: [skill.id], findings: [{ category: 'bug' }] });
    const s = await statsOf(app, skill.id);
    expect(s.findings).toBe(2);
    expect(s.by_category).toEqual([{ category: 'bug', count: 2 }]);
    await app.close();
  });

  it('a real review run records the skill list and moves pull and findings (skill NFR-4)', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const skill = (await app.inject({ method: 'POST', url: '/skills', payload: { name: uniq('active-skill'), type: 'security', body: '# Rule\nWatch secrets.' } })).json();
    const agent = (await app.inject({ method: 'POST', url: '/agents', payload: { name: uniq('Stats Agent'), provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' } })).json();
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill.id] } });
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const now = new Date();
    const qs = periodQs(new Date(now.getTime() - DAY), new Date(now.getTime() + 1000));
    const s = await statsOf(app, skill.id, qs);
    expect(s.pull_pct).toBe(100);
    expect(s.pull_runs).toBe(1);
    expect(s.findings).toBe(2);
    await app.close();
  });

  it('AC-13: one linked agent -> pull_runs / pull_runs_total equal the agent skills_usage', async () => {
    const app = await appWith();
    const skill = await newSkill();
    const agent = await newAgent();
    await link(agent.id, skill.id);
    await seedRun({ agentId: agent.id, ranAt: inPeriod(0), skills: [skill.id] });
    await seedRun({ agentId: agent.id, ranAt: inPeriod(1000), skills: ['other'] });
    await seedRun({ agentId: agent.id, ranAt: inPeriod(2000), skills: [skill.id] });
    await seedRun({ agentId: agent.id, ranAt: inPeriod(3000), status: 'failed' });
    const s = await statsOf(app, skill.id);
    const a = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/stats?${periodQs()}` })).json();
    const usage = a.skills_usage.skills.find((x: { skill_id: string }) => x.skill_id === skill.id);
    expect(s.pull_runs).toBe(usage.runs);
    expect(s.pull_runs_total).toBe(a.skills_usage.runs_with_skill_data);
    expect(s.runs_without_skill_data).toBe(a.skills_usage.runs_without_skill_data);
    await app.close();
  });

  it('AC-14: when every done run of one agent loaded the skill, the figures equal the agent\'s (both decided on one finding included)', async () => {
    const app = await appWith();
    const skill = await newSkill();
    const agent = await newAgent();
    await link(agent.id, skill.id);
    await seedRun({
      agentId: agent.id,
      ranAt: inPeriod(0),
      skills: [skill.id],
      findings: [
        { category: 'security', accepted: true },
        { category: 'security', dismissed: true },
        // both timestamps set: accepted wins, identically on both sides (C22)
        { category: 'bug', accepted: true, dismissed: true },
        { category: 'bug' },
      ],
    });
    await seedRun({ agentId: agent.id, ranAt: inPeriod(1000), skills: [skill.id], findings: [{ category: 'style', dismissed: true }] });
    const s = await statsOf(app, skill.id);
    const a = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/stats?${periodQs()}` })).json();
    const byCat = a.findings_by_category as Array<{ category: string; count: number }>;
    expect(s.findings).toBe(byCat.reduce((n, c) => n + c.count, 0));
    expect([...s.by_category].sort((x, y) => x.category.localeCompare(y.category))).toEqual(
      [...byCat].sort((x, y) => x.category.localeCompare(y.category)),
    );
    expect([s.accepted, s.dismissed, s.pending]).toEqual([a.accepted, a.dismissed, a.pending]);
    expect(s.accept_rate).toBe(a.accept_rate);
    await app.close();
  });
});
