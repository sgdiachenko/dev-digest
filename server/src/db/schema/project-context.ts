/**
 * project-context — persisted catalog of a repo's Markdown documents.
 *
 *   - contextCatalogs — 1:1 per repo, scan status + the commit it reflects.
 *   - contextDocs     — one row per catalogued document, identity (repo, path).
 *                       `blobOid` lets a rescan reuse size/tokens for unchanged
 *                       blobs without re-reading them.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { repos } from './repos';
import { workspaces } from './core';

export const contextCatalogs = pgTable(
  'context_catalogs',
  {
    repoId: uuid('repo_id')
      .primaryKey()
      .references(() => repos.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['scanning', 'ready', 'error'] })
      .notNull()
      .default('ready'),
    branch: text('branch'),
    scannedSha: text('scanned_sha'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }),
    scanStartedAt: timestamp('scan_started_at', { withTimezone: true }),
    totalFiles: integer('total_files').notNull().default(0),
    truncated: boolean('truncated').notNull().default(false),
    error: text('error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    wsIdx: index('context_catalogs_ws_idx').on(t.workspaceId),
  }),
);

export const contextDocs = pgTable(
  'context_docs',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    category: text('category', { enum: ['specs', 'docs', 'insights'] }).notNull(),
    size: integer('size').notNull(),
    estTokens: integer('est_tokens'),
    status: text('status', { enum: ['ok', 'empty', 'too_large', 'unreadable'] }).notNull(),
    secretWarning: boolean('secret_warning').notNull().default(false),
    blobOid: text('blob_oid').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.path] }),
  }),
);
