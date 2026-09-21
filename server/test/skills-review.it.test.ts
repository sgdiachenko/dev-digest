import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
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

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `skills-review-${repoSeq++}`;
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
 * L02 — a linked skill actually reaches the prompt: ordered, disabled ones
 * excluded, and trust follows `source` (manual raw, imported wrapped). Also
 * pins the trace's `config.skills` (the pull-frequency stat's data source).
 */
d('L02 skills reach the review prompt', () => {
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

  it('orders linked skills, wraps imported ones, excludes disabled ones, and records ids on the trace', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const manual = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'rule-a', type: 'custom', body: '# Rule A\nAlways do X.' },
      })
    ).json();
    expect(manual.source).toBe('manual');

    const imported = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'rule-b',
          type: 'security',
          body: '# Rule B\nWatch for Y.',
          source: 'imported_url',
        },
      })
    ).json();
    expect(imported.source).toBe('imported_url');

    const disabled = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'rule-c', type: 'custom', body: '# Rule C\nShould never appear.', enabled: false },
      })
    ).json();

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review it.' },
      })
    ).json();
    expect(agent.version).toBe(1);

    // Link in [imported, manual, disabled] order — the prompt should preserve
    // that order for the two enabled skills and omit the disabled one entirely.
    const linked = (
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [imported.id, manual.id, disabled.id] },
      })
    ).json();
    expect(linked.map((l: { skill_id: string }) => l.skill_id)).toEqual([imported.id, manual.id, disabled.id]);

    // Linking skills is a config change — same as editing the system prompt.
    const afterLink = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(afterLink.version).toBe(2);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();

    // Only the two ENABLED skills, in link order — the disabled one contributes nothing.
    expect(trace.config.skills).toEqual([imported.id, manual.id]);

    const skillsBlock: string = trace.prompt_assembly.skills;
    expect(skillsBlock).toBeTruthy();
    // manual: rendered raw (trusted, same footing as the agent's own system prompt).
    expect(skillsBlock).toContain('# Rule A\nAlways do X.');
    // imported: wrapped as untrusted, exactly like the diff/specs blocks.
    expect(skillsBlock).toContain('<untrusted source="skill:rule-b">');
    expect(skillsBlock).toContain('# Rule B\nWatch for Y.');
    // disabled skill never reaches the prompt at all.
    expect(skillsBlock).not.toContain('Rule C');
    expect(skillsBlock).not.toContain('Should never appear');

    // Section ordering: Skills / rules block exists in the full user message too.
    const user: string = trace.prompt_assembly.user;
    expect(user).toContain('## Skills / rules');
    const idxSkills = user.indexOf('## Skills / rules');
    const idxDiff = user.indexOf('## Diff to review');
    expect(idxSkills).toBeGreaterThan(-1);
    expect(idxDiff).toBeGreaterThan(idxSkills);

    // agent_runs/run_traces are the ONLY place skill usage is recorded — no
    // separate analytics table (Stats tab reads this back via trace.config.skills).
    const [runRow] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(runRow!.status).toBe('done');

    await app.close();
  });

  it('omits the Skills / rules section entirely for an agent with no linked skills', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skill-less Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review it.' },
      })
    ).json();

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Skills / rules');
    // No runs happened yet when this agent was created, so config.skills is an
    // empty array (recorded, not omitted) — distinct from a pre-L02 trace where
    // the field is entirely absent.
    expect(trace.config.skills).toEqual([]);

    await app.close();
  });
});
