/**
 * context-attachments — ordered Project Context documents pinned to an agent
 * or a skill, per repo.
 *
 * A row references a document by (repo_id, path) only — deliberately NO foreign
 * key to `context_docs`: a rescan that drops or renames a document must not
 * delete the user's selection; the entry is reported as missing instead.
 */
import { pgTable, uuid, text, integer, primaryKey, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { repos } from './repos';
import { workspaces } from './core';
import { agents } from './agents';
import { skills } from './skills';

export const agentContextDocs = pgTable(
  'agent_context_docs',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull(),
    createdAt: now(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.repoId, t.path] }),
    repoIdx: index('agent_context_docs_repo_idx').on(t.repoId),
    wsIdx: index('agent_context_docs_ws_idx').on(t.workspaceId),
  }),
);

export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull(),
    createdAt: now(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.skillId, t.repoId, t.path] }),
    repoIdx: index('skill_context_docs_repo_idx').on(t.repoId),
    wsIdx: index('skill_context_docs_ws_idx').on(t.workspaceId),
  }),
);
