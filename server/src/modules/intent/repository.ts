import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { IntentSourceRow } from '../../db/schema/reviews.js';
import { IntentSourceKind, type IntentConfidence, type IntentSource } from '@devdigest/shared';

/**
 * Intent Layer data-access — the ONLY layer touching `pr_intent` + the small
 * cross-table read `getPullContext` needs (pull, repo, commits, files).
 * Self-contained rather than reaching into `modules/reviews/repository.ts`:
 * two modules share through container-provided repositories, never by
 * importing another module's internals.
 */

export interface IntentPull {
  id: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
  repoId: string;
}

export interface IntentRepo {
  owner: string;
  name: string;
  fullName: string;
}

export interface IntentPullContext {
  pull: IntentPull;
  repo: IntentRepo;
  commits: { sha: string; message: string }[];
  files: { path: string; additions: number; deletions: number }[];
}

/**
 * The `pr_intent` row, mapped to domain types — `sources` is the shared
 * `IntentSource` contract type (ring 0), not the db-schema-local
 * `IntentSourceRow` (ring 4 detail); a row never crosses this boundary
 * unmapped (onion-architecture: row/domain mapping happens HERE).
 */
export interface IntentRow {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  provider: string | null;
  model: string | null;
  costUsd: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  inputHash: string | null;
  headSha: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UpsertIntentValues = Omit<IntentRow, 'prId' | 'createdAt' | 'updatedAt'>;

function toIntentSource(row: IntentSourceRow): IntentSource {
  return {
    kind: IntentSourceKind.parse(row.kind),
    ref: row.ref,
    resolved: row.resolved,
    linked: row.linked,
    note: row.note ?? null,
  };
}

function toIntentRow(row: typeof t.prIntent.$inferSelect): IntentRow {
  return {
    prId: row.prId,
    intent: row.intent,
    inScope: row.inScope,
    outOfScope: row.outOfScope,
    confidence: row.confidence as IntentConfidence,
    sources: row.sources.map(toIntentSource),
    provider: row.provider,
    model: row.model,
    costUsd: row.costUsd,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    inputHash: row.inputHash,
    headSha: row.headSha,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class IntentRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped: pull + its repo + commits + files, for the extraction sources. */
  async getPullContext(workspaceId: string, prId: string): Promise<IntentPullContext | undefined> {
    const [pull] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) return undefined;

    const [repo] = await this.db.select().from(t.repos).where(eq(t.repos.id, pull.repoId));
    if (!repo) return undefined;

    const [commits, files] = await Promise.all([
      this.db
        .select({ sha: t.prCommits.sha, message: t.prCommits.message })
        .from(t.prCommits)
        .where(eq(t.prCommits.prId, prId)),
      this.db
        .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
        .from(t.prFiles)
        .where(eq(t.prFiles.prId, prId)),
    ]);

    return {
      pull: {
        id: pull.id,
        number: pull.number,
        title: pull.title,
        body: pull.body,
        branch: pull.branch,
        headSha: pull.headSha,
        repoId: pull.repoId,
      },
      repo: { owner: repo.owner, name: repo.name, fullName: repo.fullName },
      commits,
      files,
    };
  }

  async get(prId: string): Promise<IntentRow | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row ? toIntentRow(row) : undefined;
  }

  /**
   * Insert or update `pr_intent`. `cost_usd` is the one field that does NOT
   * simply overwrite: it ACCUMULATES (`coalesce(existing, 0) + coalesce(new, 0)`)
   * because `pulls/service.ts`'s lifetime PR cost reads it additively (Q4) — a
   * plain overwrite would silently drop every earlier derivation's cost each
   * time a PR's intent is re-derived. `tokens_in`/`tokens_out` stay
   * PER-DERIVATION (the latest call's numbers, overwritten each time): they're
   * diagnostic for "how much did the LAST run cost", not a lifetime total: (the
   * cache-hit path never calls `upsert` at all, so a $0/no-model-call
   * derivation never reaches this accumulation either — see `service.ts`).
   */
  async upsert(prId: string, values: UpsertIntentValues): Promise<IntentRow> {
    const now = new Date();
    const insertValues = {
      prId,
      intent: values.intent,
      inScope: values.inScope,
      outOfScope: values.outOfScope,
      confidence: values.confidence,
      sources: values.sources,
      provider: values.provider,
      model: values.model,
      costUsd: values.costUsd,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      inputHash: values.inputHash,
      headSha: values.headSha,
      updatedAt: now,
    };
    const [row] = await this.db
      .insert(t.prIntent)
      .values(insertValues)
      .onConflictDoUpdate({
        target: t.prIntent.prId,
        set: {
          intent: values.intent,
          inScope: values.inScope,
          outOfScope: values.outOfScope,
          confidence: values.confidence,
          sources: values.sources,
          provider: values.provider,
          model: values.model,
          costUsd: sql`coalesce(${t.prIntent.costUsd}, 0) + coalesce(excluded.cost_usd, 0)`,
          tokensIn: values.tokensIn,
          tokensOut: values.tokensOut,
          inputHash: values.inputHash,
          headSha: values.headSha,
          updatedAt: now,
        },
      })
      .returning();
    return toIntentRow(row!);
  }
}
