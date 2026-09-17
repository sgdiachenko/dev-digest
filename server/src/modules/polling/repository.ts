import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrMeta } from '@devdigest/shared';

/** Polling data-access: the PR-list sync. The only place this module touches Drizzle. */

export interface PollRepo {
  id: string;
  owner: string;
  name: string;
}

export class PollingRepository {
  constructor(private db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<PollRepo | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ? { id: row.id, owner: row.owner, name: row.name } : undefined;
  }

  /**
   * Idempotent PR-list sync (unique repo_id + number). Only the fields that
   * actually move are refreshed — `openedAt` and the diff stats are set on
   * insert and left alone afterwards, matching the pulls module's upsert.
   */
  async upsertPull(workspaceId: string, repoId: string, pr: PrMeta): Promise<void> {
    await this.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        headSha: pr.head_sha,
        additions: pr.additions,
        deletions: pr.deletions,
        filesCount: pr.files_count,
        status: pr.status,
        updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
      })
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: pr.title,
          headSha: pr.head_sha,
          status: pr.status,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        },
      });
  }

  async markPolled(repoId: string): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: new Date() }).where(eq(t.repos.id, repoId));
  }
}
