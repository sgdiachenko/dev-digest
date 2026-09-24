import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

/**
 * One `pr_intent.sources` entry — the plain jsonb row shape, deliberately NOT
 * the `IntentSource` Zod contract type: the schema stays decoupled from
 * `vendor/shared`, and the repository maps row → domain at the boundary (see
 * onion-architecture skill, "row/domain mapping").
 */
export interface IntentSourceRow {
  kind: string;
  ref: string;
  resolved: boolean;
  linked: boolean;
  note?: string | null;
}

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  confidence: text('confidence', { enum: ['high', 'medium', 'low'] }).notNull().default('low'),
  sources: jsonb('sources').$type<IntentSourceRow[]>().notNull().default(sql`'[]'::jsonb`),
  provider: text('provider'),
  model: text('model'),
  costUsd: doublePrecision('cost_usd'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  /** Hash of (model, title, body, headSha, source digests, PROMPT_VERSION) — a
   *  cache key; a miss means the inputs changed since the last derivation. */
  inputHash: text('input_hash'),
  /** head_sha the derivation ran against — compared to the PR's current
   *  head_sha to compute `stale` at read time (never persisted as a bool). */
  headSha: text('head_sha'),
  createdAt: now(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
