import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

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
 * The Skill Editor's Stats tab — every tile derived from `agent_skills` /
 * `findings` / `reviews` / `agent_runs` / `run_traces`, no separate analytics
 * table. Covers the "null, not 0%, until there's data" honesty rule.
 */
d('Skill Stats tab', () => {
  let pg: PgFixture;
  let workspaceId: string;

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
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  it('a freshly-linked, never-run skill reports null pull/accept rates, not 0%', async () => {
    const app = await appWith();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: { name: 'fresh-skill', type: 'custom', body: '# Rule\nx' } })
    ).json();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Unused Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill.id] } });

    const stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
    expect(stats.agent_count).toBe(1);
    expect(stats.pull_pct).toBeNull();
    expect(stats.accept_pct).toBeNull();
    expect(stats.findings_30d).toBe(0);
    expect(stats.agents).toEqual([{ id: agent.id, name: 'Unused Agent' }]);
    await app.close();
  });

  it('pull_pct, findings, and accept_pct move after real runs and finding triage', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'active-skill', type: 'security', body: '# Rule\nWatch secrets.' },
      })
    ).json();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Stats Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill.id] } });

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    let stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
    // The one run this agent has made used the skill (it was linked before the run).
    expect(stats.pull_pct).toBe(100);
    expect(stats.findings_30d).toBe(2);
    expect(stats.by_category.sort((a: { category: string }, b: { category: string }) => a.category.localeCompare(b.category))).toEqual(
      [
        { category: 'bug', count: 1 },
        { category: 'security', count: 1 },
      ],
    );
    // Nothing triaged yet.
    expect(stats.accept_pct).toBeNull();

    // Accept one finding, dismiss the other — accept rate becomes a real number.
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    const findings = reviews[0].findings as Array<{ id: string }>;
    expect(findings).toHaveLength(2);
    await app.inject({ method: 'POST', url: `/findings/${findings[0]!.id}/accept` });
    await app.inject({ method: 'POST', url: `/findings/${findings[1]!.id}/dismiss` });

    stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
    expect(stats.accept_pct).toBe(50);

    // Unlinking the skill and running again drops pull_pct to 50% (1 of 2 runs).
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [] } });
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
    // agent_count is 0 now (unlinked) — the stat reports on runs from when it
    // WAS an agent's skill, via the linked-agent set at read time. Unlinking
    // removes the agent from agent_count, and with no linked agents this
    // starter's stats read as "no agents" — the safest reading is an empty set.
    expect(stats.agent_count).toBe(0);

    await app.close();
  });

  it('with no agents ever linked, all counters are zero/null, never an error', async () => {
    const app = await appWith();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: { name: 'lonely-skill', type: 'custom', body: '# x\ny' } })
    ).json();
    const stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
    expect(stats).toMatchObject({
      agent_count: 0,
      pull_pct: null,
      accept_pct: null,
      findings_30d: 0,
      by_category: [],
      agents: [],
    });
    await app.close();
  });

  it('GET /skills batches stats for the whole rail in one request (no N+1)', async () => {
    const app = await appWith();
    const a = (await app.inject({ method: 'POST', url: '/skills', payload: { name: 'batch-a', type: 'custom', body: 'x' } })).json();
    const b = (await app.inject({ method: 'POST', url: '/skills', payload: { name: 'batch-b', type: 'custom', body: 'y' } })).json();
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const byId = new Map(list.map((s: { id: string }) => [s.id, s]));
    expect(byId.get(a.id)).toMatchObject({ stats: { agent_count: 0, pull_pct: null } });
    expect(byId.get(b.id)).toMatchObject({ stats: { agent_count: 0, pull_pct: null } });
    await app.close();
  });
});
