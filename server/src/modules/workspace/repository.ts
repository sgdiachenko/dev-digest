import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Workspace overview data-access. The only place this module touches Drizzle. */

export interface ClonedRepoSummary {
  id: string;
  full_name: string;
  clone_path: string | null;
  last_polled_at: string | null;
  cloned: boolean;
}

export class WorkspaceRepository {
  constructor(private db: Db) {}

  /** Cloned-repo summary for the workspace overview. */
  async listRepos(workspaceId: string): Promise<ClonedRepoSummary[]> {
    const rows = await this.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    return rows.map((r) => ({
      id: r.id,
      full_name: r.fullName,
      clone_path: r.clonePath,
      last_polled_at: r.lastPolledAt?.toISOString() ?? null,
      cloned: Boolean(r.clonePath),
    }));
  }
}
