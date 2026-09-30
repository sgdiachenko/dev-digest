import { and, asc, eq } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  CatalogDoc,
  CatalogState,
  ContextRepo,
  ProjectContextStore,
  ReplaceCatalogInput,
} from './types.js';

/** Rows per INSERT; far below postgres' bind-parameter limit at 8 columns. */
const INSERT_BATCH = 1_000;

type DocRow = typeof t.contextDocs.$inferSelect;
type CatalogRow = typeof t.contextCatalogs.$inferSelect;

const toDoc = (r: DocRow): CatalogDoc => ({
  path: r.path,
  category: r.category,
  size: r.size,
  estTokens: r.estTokens,
  status: r.status,
  secretWarning: r.secretWarning,
  blobOid: r.blobOid,
});

const toState = (r: CatalogRow): CatalogState => ({
  repoId: r.repoId,
  status: r.status,
  branch: r.branch,
  scannedSha: r.scannedSha,
  scannedAt: r.scannedAt,
  scanStartedAt: r.scanStartedAt,
  totalFiles: r.totalFiles,
  truncated: r.truncated,
  error: r.error,
});

const repoCols = {
  id: t.repos.id,
  workspaceId: t.repos.workspaceId,
  owner: t.repos.owner,
  name: t.repos.name,
  defaultBranch: t.repos.defaultBranch,
  clonePath: t.repos.clonePath,
};

async function upsertCatalogRow(
  db: DbOrTx,
  repoId: string,
  workspaceId: string,
  values: Partial<typeof t.contextCatalogs.$inferInsert>,
): Promise<void> {
  const set = { ...values, updatedAt: new Date() };
  await db
    .insert(t.contextCatalogs)
    .values({ repoId, workspaceId, ...set })
    .onConflictDoUpdate({ target: t.contextCatalogs.repoId, set });
}

/** The ONLY place that touches `context_catalogs` / `context_docs`. */
export class ProjectContextRepository implements ProjectContextStore {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<ContextRepo | null> {
    const [row] = await this.db
      .select(repoCols)
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  async getRepoById(repoId: string): Promise<ContextRepo | null> {
    const [row] = await this.db.select(repoCols).from(t.repos).where(eq(t.repos.id, repoId));
    return row ?? null;
  }

  async getCatalogState(repoId: string): Promise<CatalogState | null> {
    const [row] = await this.db
      .select()
      .from(t.contextCatalogs)
      .where(eq(t.contextCatalogs.repoId, repoId));
    return row ? toState(row) : null;
  }

  async listDocs(repoId: string): Promise<CatalogDoc[]> {
    const rows = await this.db
      .select()
      .from(t.contextDocs)
      .where(eq(t.contextDocs.repoId, repoId))
      .orderBy(asc(t.contextDocs.path));
    return rows.map(toDoc);
  }

  async getDoc(repoId: string, path: string): Promise<CatalogDoc | null> {
    const [row] = await this.db
      .select()
      .from(t.contextDocs)
      .where(and(eq(t.contextDocs.repoId, repoId), eq(t.contextDocs.path, path)));
    return row ? toDoc(row) : null;
  }

  async markScanning(repoId: string, workspaceId: string, startedAt: Date): Promise<void> {
    await upsertCatalogRow(this.db, repoId, workspaceId, {
      status: 'scanning',
      scanStartedAt: startedAt,
    });
  }

  /** Catalog row + all docs swap in ONE transaction: a reader never sees a half-built catalog. */
  async replaceCatalog(input: ReplaceCatalogInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      await upsertCatalogRow(tx, input.repoId, input.workspaceId, {
        status: 'ready',
        branch: input.branch,
        scannedSha: input.scannedSha,
        scannedAt: input.scannedAt,
        scanStartedAt: null,
        totalFiles: input.totalFiles,
        truncated: input.truncated,
        error: null,
      });
      await tx.delete(t.contextDocs).where(eq(t.contextDocs.repoId, input.repoId));
      for (let i = 0; i < input.docs.length; i += INSERT_BATCH) {
        await tx.insert(t.contextDocs).values(
          input.docs.slice(i, i + INSERT_BATCH).map((d) => ({ repoId: input.repoId, ...d })),
        );
      }
    });
  }

  async markError(repoId: string, workspaceId: string, reason: string): Promise<void> {
    await upsertCatalogRow(this.db, repoId, workspaceId, {
      status: 'error',
      error: reason,
      scanStartedAt: null,
    });
  }
}
