import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  doublePrecision,
  jsonb,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    githubRepoId: bigint('github_repo_id', { mode: 'number' }),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    agentSlug: text('agent_slug'),
    agentVersion: integer('agent_version'),
    ciFailOn: text('ci_fail_on', { enum: ['never', 'critical', 'warning', 'any'] }),
    postAs: text('post_as', { enum: ['github_review', 'pr_comment', 'none'] }),
    triggers: jsonb('triggers').$type<string[]>(),
    workflowPath: text('workflow_path'),
    prUrl: text('pr_url'),
    prNumber: integer('pr_number'),
    // Export-time snapshot (compared with the current agent for `outdated`).
    exportedModel: text('exported_model'),
    exportedSkills: jsonb('exported_skills').$type<{ slug: string; sha256: string }[]>(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    agentRepoUnique: unique('ci_installations_agent_repo_unique').on(t.agentId, t.repo),
  }),
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    repo: text('repo'),
    githubRepoId: bigint('github_repo_id', { mode: 'number' }),
    workflowRunId: bigint('workflow_run_id', { mode: 'number' }),
    runAttempt: integer('run_attempt').notNull().default(1),
    headSha: text('head_sha'),
    headRepo: text('head_repo'),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    durationS: doublePrecision('duration_s'),
    status: text('status'),
    verdict: text('verdict'),
    findingsCount: integer('findings_count'),
    critical: integer('critical'),
    warning: integer('warning'),
    suggestion: integer('suggestion'),
    costUsd: doublePrecision('cost_usd'),
    agentVersion: integer('agent_version'),
    unavailableReason: text('unavailable_reason'),
    model: text('model'),
    ciFailOn: text('ci_fail_on'),
    skills: jsonb('skills').$type<{ slug: string; sha256: string }[]>(),
    memorySha256: text('memory_sha256'),
    manifestSha256: text('manifest_sha256'),
    runnerBuild: text('runner_build'),
    githubUrl: text('github_url'),
    source: text('source'),
  },
  (t) => ({
    runIdentityUnique: unique('ci_runs_identity_unique').on(
      t.githubRepoId,
      t.workflowRunId,
      t.runAttempt,
      t.ciInstallationId,
    ),
    ranAtIdx: index('ci_runs_ran_at_idx').on(t.ranAt),
  }),
);
