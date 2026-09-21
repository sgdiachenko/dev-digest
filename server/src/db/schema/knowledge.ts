import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  vector,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * One scan run of the Conventions Extractor. Exists so `POST …/extract` can
 * return immediately (202 + this row's id) while the model call runs on the
 * job queue — the client polls this row until `status` leaves `'running'`.
 *
 * The counters are why a short result set reads as "the gate worked" instead
 * of "the feature is broken": `proposed` vs. the sum of the `dropped*`
 * columns explains exactly where every candidate went.
 */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    jobId: text('job_id'),
    status: text('status', { enum: ['running', 'done', 'failed'] })
      .notNull()
      .default('running'),
    sampledFiles: jsonb('sampled_files').$type<string[]>(),
    proposed: integer('proposed').notNull().default(0),
    fromConfig: integer('from_config').notNull().default(0),
    droppedUngrounded: integer('dropped_ungrounded').notNull().default(0),
    droppedUnsupported: integer('dropped_unsupported').notNull().default(0),
    droppedDuplicate: integer('dropped_duplicate').notNull().default(0),
    droppedExistingSkill: integer('dropped_existing_skill').notNull().default(0),
    droppedCategoryCap: integer('dropped_category_cap').notNull().default(0),
    model: text('model'),
    costUsd: doublePrecision('cost_usd'),
    error: text('error'),
    /** When the scan started — the shared `created_at` column (see `_shared.ts`). */
    createdAt: now(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    repoStartedIdx: index('convention_scans_repo_started_idx').on(t.repoId, t.createdAt.desc()),
    statusCk: check('convention_scans_status_ck', sql`${t.status} in ('running', 'done', 'failed')`),
  }),
);

/**
 * Convention candidates extracted from a repo (the Conventions Extractor).
 *
 * A row is a PROPOSAL, not a fact: either the model wrote it (`origin:
 * 'model'`) and code verified its evidence against the checked-out file
 * (see modules/conventions/helpers.ts), or a config file states it outright
 * (`origin: 'config'`, confidence 1.0, no model call). `status` is the user's
 * decision — three states, not a boolean, because a re-scan replaces only the
 * `pending` rows: an accepted or rejected rule is never re-litigated.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    /** Grouping shown on the card and used as the skill's section heading. */
    category: text('category', {
      enum: ['naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general'],
    })
      .notNull()
      .default('general'),
    rule: text('rule').notNull(),
    /** Why the rule exists / what a reviewer should flag — editable. */
    rationale: text('rationale'),
    evidencePath: text('evidence_path'),
    /** 1-based line of `evidence_snippet` in `evidence_path`, as verified by code. */
    evidenceLine: integer('evidence_line'),
    evidenceSnippet: text('evidence_snippet'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    /** 'model' = proposed and evidence-gated; 'config' = parsed straight out of
     *  a config file, no model call, confidence fixed at 1.0. */
    origin: text('origin', { enum: ['model', 'config'] })
      .notNull()
      .default('model'),
    /** Distinct repo-wide files matching `probe` (frequency grounding). Null
     *  until the grep pass has run; always null for `origin: 'config'` rows. */
    supportCount: integer('support_count'),
    /** The grep pattern used for frequency grounding, kept so a re-scan can
     *  re-count without another model call. Sanitized before it ever reaches
     *  ripgrep — see modules/conventions/frequency.ts. */
    probe: text('probe'),
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
    createdAt: now(),
  },
  (t) => ({
    // Every read is "this repo's candidates, newest first"; Postgres does not
    // index foreign keys automatically.
    repoCreatedIdx: index('conventions_repo_created_idx').on(t.repoId, t.createdAt.desc()),
    // `text({ enum })` narrows TypeScript only and emits no DB constraint —
    // these mirror the ConventionStatus / ConventionCategory / origin contract enums.
    statusCk: check('conventions_status_ck', sql`${t.status} in ('pending', 'accepted', 'rejected')`),
    categoryCk: check(
      'conventions_category_ck',
      sql`${t.category} in ('naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general')`,
    ),
    originCk: check('conventions_origin_ck', sql`${t.origin} in ('model', 'config')`),
  }),
);
