import 'dotenv/config';
import { zipSync, strToU8 } from 'fflate';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';
import {
  PR_QUALITY_RUBRIC_SKILL,
  NO_THEN_CHAINS_SKILL,
  SECRET_LEAKAGE_GATE_SKILL,
  TEST_COVERAGE_NUDGE_SKILL,
  WIRE_FORMAT_CONVENTION_SKILL,
  FLAKY_TEST_SIGNALS_SKILL,
} from './seed-skills.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { SkillsRepository } from '../modules/skills/repository.js';
import { parseImport } from '../modules/skills/helpers.js';
import type { SkillType } from '@devdigest/shared';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and five built-in agents — the original three (General +
 * Security + Performance) plus L02's Test Quality Reviewer + API Contract
 * Reviewer — all on the default openrouter/deepseek-v4-flash provider+model.
 * L02 also seeds five built-in skills and links them to the agents above, so
 * the control experiment (same agent, with vs. without its skills) works
 * out of the box.
 *
 * Course lessons populate the other tables (conventions, memory, eval, …) once
 * their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- L02 control-experiment PRs ----
  // One fixture per new agent, each crafted so the linked skill's SPECIFIC
  // instruction — not just the agent's own general judgment — is what makes
  // the finding show up: run the agent once with its skill unlinked (misses
  // it) and once linked (catches it) to reproduce "without skills / with
  // skills" for real, on a real model call.
  let [pr483] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 483)));
  if (!pr483) {
    [pr483] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 483,
        title: 'Add chunkArray helper for paginated webhook delivery',
        author: 'dan.reyes',
        branch: 'feat/chunk-array',
        base: 'main',
        headSha: 'b2c3d4e5f6a1',
        additions: 15,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
        body: 'Splits a batch of webhook deliveries into fixed-size chunks before fan-out.',
      })
      .returning();

    // Test Quality control experiment: a new function, a test that covers
    // ONLY the happy path (no test for an empty array, none for a chunk size
    // larger than the array) — test-coverage-nudge's exact trigger.
    await db.insert(t.prFiles).values([
      {
        prId: pr483!.id,
        path: 'src/lib/chunk.ts',
        additions: 7,
        deletions: 0,
        patch: [
          '@@ -0,0 +1,7 @@',
          '+export function chunkArray<T>(items: T[], size: number): T[][] {',
          '+  const chunks: T[][] = [];',
          '+  for (let i = 0; i < items.length; i += size) {',
          '+    chunks.push(items.slice(i, i + size));',
          '+  }',
          '+  return chunks;',
          '+}',
        ].join('\n'),
      },
      {
        prId: pr483!.id,
        path: 'src/lib/chunk.test.ts',
        additions: 8,
        deletions: 0,
        // Happy path only — no test for an empty array or a chunk size
        // larger than the array (both plausible boundary inputs).
        patch: [
          '@@ -0,0 +1,8 @@',
          "+import { describe, it, expect } from 'vitest';",
          "+import { chunkArray } from './chunk';",
          '+',
          "+describe('chunkArray', () => {",
          "+  it('splits an array into chunks of the given size', () => {",
          '+    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);',
          '+  });',
          '+});',
        ].join('\n'),
      },
    ]);
    await db.insert(t.prCommits).values({
      prId: pr483!.id,
      sha: 'b2c3d4e5f6a1',
      message: 'Add chunkArray helper for paginated webhook delivery',
      author: 'dan.reyes',
    });
  }

  let [pr484] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 484)));
  if (!pr484) {
    [pr484] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 484,
        title: 'Surface retry count on the webhook status endpoint',
        author: 'priya.nair',
        branch: 'feat/webhook-retry-count',
        base: 'main',
        headSha: 'c3d4e5f6a1b2',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Adds retryCount to GET /api/webhooks/:id/status so the dashboard can show delivery attempts.',
      })
      .returning();

    // API Contract control experiment: an ADDITIVE field (existing callers
    // are unaffected), added in camelCase where every other field on this
    // route is snake_case. API_CONTRACT_REVIEWER_PROMPT explicitly says
    // "additive, backward-compatible changes are NOT findings — do not flag
    // … even as a SUGGESTION", so WITHOUT wire-format-convention linked the
    // agent is instructed to stay silent on it; the skill's own rule
    // ("A field added to vendor/shared/contracts/* in camelCase … flag it as
    // a WARNING") overrides that for this one specific violation when linked.
    await db.insert(t.prFiles).values({
      prId: pr484!.id,
      path: 'src/api/public/webhooks.ts',
      additions: 1,
      deletions: 0,
      patch: [
        '@@ -1,9 +1,10 @@',
        " app.get('/api/webhooks/:id/status', async (req, reply) => {",
        '   const record = await db.getWebhookDelivery(req.params.id);',
        "   if (!record) return reply.code(404).send({ error: 'not found' });",
        '   return {',
        '     status: record.status,',
        '     last_attempt_at: record.lastAttemptAt,',
        '     next_attempt_at: record.nextAttemptAt,',
        '+    retryCount: record.retryCount,',
        '   };',
        ' });',
      ].join('\n'),
    });
    await db.insert(t.prCommits).values({
      prId: pr484!.id,
      sha: 'c3d4e5f6a1b2',
      message: 'Surface retry count on the webhook status endpoint',
      author: 'priya.nair',
    });
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- L02: built-in skills ----
  // Bodies live in ./seed-skills.ts (mirrored in docs/agent-prompts/skills/*.md).
  // Routed through SkillsRepository (not a raw insert) so each gets its v1
  // `skill_versions` row — the invariant `skills.version` ⇔ a snapshot exists
  // only holds when creation goes through the repository.
  const skillsRepo = new SkillsRepository(db);
  const agentsRepo = new AgentsRepository(db);

  const seedSkills: Array<{ name: string; description: string; type: SkillType; body: string }> = [
    {
      name: 'pr-quality-rubric',
      description: 'Rubric for evaluating overall PR quality across correctness, tests, and scope.',
      type: 'rubric',
      body: PR_QUALITY_RUBRIC_SKILL,
    },
    {
      name: 'no-then-chains',
      description: 'House rule: always use async/await instead of .then() chains.',
      type: 'convention',
      body: NO_THEN_CHAINS_SKILL,
    },
    {
      name: 'secret-leakage-gate',
      description: 'Detects credential-shaped strings (sk_live_, ghp_, JWTs, private keys) left in a diff.',
      type: 'security',
      body: SECRET_LEAKAGE_GATE_SKILL,
    },
    {
      name: 'test-coverage-nudge',
      description: 'Suggests a test when a diff adds a new branch with no coverage.',
      type: 'custom',
      body: TEST_COVERAGE_NUDGE_SKILL,
    },
    {
      name: 'wire-format-convention',
      description: 'House rule: shared contract/DTO fields are snake_case on the wire.',
      type: 'convention',
      body: WIRE_FORMAT_CONVENTION_SKILL,
    },
  ];
  const skillIdByName = new Map<string, string>();
  for (const s of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (existing) {
      skillIdByName.set(s.name, existing.id);
    } else {
      const row = await skillsRepo.insert({
        workspaceId,
        name: s.name,
        description: s.description,
        type: s.type,
        source: 'manual',
        body: s.body,
      });
      skillIdByName.set(s.name, row.id);
    }
  }

  // Give pr-quality-rubric a second version so the Skill Editor's Versions tab
  // has real history on first run — once only (skip on re-seed once it's past v1).
  const rubricId = skillIdByName.get('pr-quality-rubric');
  if (rubricId) {
    const [rubric] = await db.select().from(t.skills).where(eq(t.skills.id, rubricId));
    if (rubric && rubric.version === 1) {
      await skillsRepo.update(workspaceId, rubricId, {
        body: `${rubric.body}\n## Security\n- Any secrets, tokens, or credentials in the diff?\n`,
        note: 'Added Security dimension',
      });
    }
  }

  // ---- L02: the two skills-lesson agents (each ships with ≥1 linked skill) ----
  const seedSkillAgents: Array<{ name: string; description: string; systemPrompt: string; skills: string[] }> = [
    {
      name: 'Test Quality Reviewer',
      description: 'Reviews the tests in a PR: uncovered branches, missing corner cases, over-mocking, flakiness.',
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      skills: ['test-coverage-nudge'],
    },
    {
      name: 'API Contract Reviewer',
      description: 'Flags breaking changes to a route signature or a shared DTO.',
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      skills: ['wire-format-convention'],
    },
  ];
  for (const a of seedSkillAgents) {
    let [agentRow] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!agentRow) {
      agentRow = await agentsRepo.insert({
        workspaceId,
        name: a.name,
        description: a.description,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        systemPrompt: a.systemPrompt,
        createdBy: userId,
      });
    }
    const skillIds = a.skills.map((n) => skillIdByName.get(n)).filter((id): id is string => id !== undefined);
    // setSkills is itself idempotent (only bumps agents.version on a REAL
    // change — see AgentsRepository.setSkills) so re-seeding is safe.
    await agentsRepo.setSkills(agentRow.id, skillIds);
  }

  // ---- L02: one skill seeded via the REAL import path, "to walk the whole
  // path" — a .zip (with a companion file that must be skipped, never read)
  // run through the exact parser POST /skills/import calls, then inserted
  // with the DRAFT's OWN source ('imported_url', not 'manual'). Lands
  // disabled, same as a real import — "needs vetting" until someone reviews
  // and enables it in the UI. Linked (while disabled) to Test Quality
  // Reviewer via linkSkill, which is additive — it does not disturb the
  // ordered test-coverage-nudge link already set above.
  const [existingImported] = await db
    .select()
    .from(t.skills)
    .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, 'flaky-test-signals')));
  if (!existingImported) {
    const bundle = zipSync({
      'SKILL.md': strToU8(FLAKY_TEST_SIGNALS_SKILL),
      'scripts/check.sh': strToU8('#!/bin/sh\necho "not part of the skill"'),
    });
    const draft = parseImport('flaky-test-signals.zip', bundle);
    const importedRow = await skillsRepo.insert({
      workspaceId,
      name: draft.name,
      description: draft.description,
      type: draft.type,
      source: draft.source,
      body: draft.body,
      enabled: false,
    });
    skillIdByName.set(draft.name, importedRow.id);
  }
  const importedSkillId = skillIdByName.get('flaky-test-signals');
  const [testQualityAgent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
  if (importedSkillId && testQualityAgent) {
    await agentsRepo.linkSkill(testQualityAgent.id, importedSkillId, 1);
  }

  // Link skills to the three pre-existing agents too, so the Stats tab has
  // "N agents" / findings to show immediately, not just on the two new ones.
  // Those three were inserted via a raw db.insert above (not the repository),
  // so backfill their missing v1 agent_versions snapshot first — otherwise the
  // version bump setSkills performs would jump straight to v2 with no v1 on
  // record.
  const preExisting: Array<{ agentName: string; skillNames: string[] }> = [
    { agentName: 'General Reviewer', skillNames: ['pr-quality-rubric', 'no-then-chains'] },
    { agentName: 'Security Reviewer', skillNames: ['secret-leakage-gate'] },
  ];
  for (const { agentName, skillNames } of preExisting) {
    const [agentRow] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentName)));
    if (!agentRow) continue;
    await agentsRepo.ensureInitialVersionSnapshot(agentRow.id);
    const skillIds = skillNames.map((n) => skillIdByName.get(n)).filter((id): id is string => id !== undefined);
    await agentsRepo.setSkills(agentRow.id, skillIds);
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
