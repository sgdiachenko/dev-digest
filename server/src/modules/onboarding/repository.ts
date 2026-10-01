import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { StoredNarrativeState } from './narrative/types.js';
import type { NarrativeStore, TourRepo, TourRepoStore } from './types.js';

/** Postgres foreign_key_violation; drizzle may wrap the driver error in `cause`. */
const isForeignKeyViolation = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23503' || e?.cause?.code === '23503';
};

/** The ONLY place the onboarding module touches the database. */
export class OnboardingRepository implements TourRepoStore, NarrativeStore {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<TourRepo | null> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        workspaceId: t.repos.workspaceId,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  async read(repoId: string): Promise<StoredNarrativeState | null> {
    const [row] = await this.db
      .select({ json: t.onboarding.json })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    if (!row) return null;
    const parsed = StoredNarrativeState.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  async write(repoId: string, state: StoredNarrativeState): Promise<'ok' | 'repo_gone'> {
    const set = { json: state, generatedAt: new Date() };
    try {
      await this.db
        .insert(t.onboarding)
        .values({ repoId, ...set })
        .onConflictDoUpdate({ target: t.onboarding.repoId, set });
      return 'ok';
    } catch (err) {
      if (isForeignKeyViolation(err)) return 'repo_gone';
      throw err;
    }
  }
}
