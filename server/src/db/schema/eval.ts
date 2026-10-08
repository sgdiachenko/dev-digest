import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['must_find', 'must_not_flag'] }),
    expectations: jsonb('expectations'),
    diffSource: text('diff_source'),
    // No FK on purpose: a case must outlive changes to the finding it was drafted from.
    sourceFindingId: uuid('source_finding_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerNameUq: uniqueIndex('eval_cases_owner_name_uq').on(t.ownerKind, t.ownerId, t.name),
    agentIdx: index('eval_cases_agent_idx').on(t.agentId),
  }),
);

export const evalSuiteRuns = pgTable(
  'eval_suite_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    status: text('status', {
      enum: ['queued', 'running', 'completed', 'failed', 'interrupted', 'cancelled'],
    })
      .notNull()
      .default('queued'),
    agentVersion: integer('agent_version'),
    config: jsonb('config'),
    caseIds: jsonb('case_ids'),
    casesTotal: integer('cases_total').notNull().default(0),
    casesCompleted: integer('cases_completed').notNull().default(0),
    casesErrored: integer('cases_errored').notNull().default(0),
    casesPassed: integer('cases_passed').notNull().default(0),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorReason: text('error_reason'),
  },
  (t) => ({
    oneActiveUq: uniqueIndex('eval_suite_runs_one_active_uq')
      .on(t.agentId)
      .where(sql`status in ('queued','running')`),
    agentStartedIdx: index('eval_suite_runs_agent_started_idx').on(t.agentId, t.startedAt.desc()),
    wsStartedIdx: index('eval_suite_runs_ws_started_idx').on(t.workspaceId, t.startedAt.desc()),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    suiteRunId: uuid('suite_run_id')
      .notNull()
      .references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['queued', 'running', 'pass', 'fail', 'error', 'timeout'] })
      .notNull()
      .default('queued'),
    errorReason: text('error_reason'),
    caseName: text('case_name'),
    dropped: jsonb('dropped'),
    expectedCount: integer('expected_count'),
    actualCount: integer('actual_count'),
  },
  (t) => ({
    caseRanIdx: index('eval_runs_case_ran_idx').on(t.caseId, t.ranAt.desc()),
    suiteRunIdx: index('eval_runs_suite_run_idx').on(t.suiteRunId),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
