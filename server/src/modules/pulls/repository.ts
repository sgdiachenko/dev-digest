import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrMeta } from '@devdigest/shared';
import type { summarizeFindings } from '../reviews/helpers.js';

/** Exactly what `summarizeFindings` consumes — derived rather than restated, so
 *  the finding row shape never has to be named outside this file. */
export type FindingsInput = Parameters<typeof summarizeFindings>[0];

/**
 * F1 — pulls data-access layer. The ONLY place in this module that touches
 * Drizzle; `service.ts` orchestrates and `routes.ts` is pure transport.
 *
 * Reads that feed the PR list (`score`, `findings_summary`, `cost_usd`) are
 * batched with `IN (...)` over the page's PR ids rather than per-row queries —
 * the list is small and this keeps it at a handful of round-trips.
 */

export type RepoRow = typeof t.repos.$inferSelect;
type PrFileRow = typeof t.prFiles.$inferSelect;
type PrCommitRow = typeof t.prCommits.$inferSelect;

/**
 * The pulls module's domain view of a pull request.
 *
 * Deliberately NOT `typeof t.pullRequests.$inferSelect`: a Drizzle row is the
 * shape of a table, and letting it travel into the service/helpers welds those
 * layers to the schema — a column rename then becomes an API break. The
 * repository maps row → `Pull` here, at the boundary, and nothing above it
 * imports `db/*`.
 */
export interface Pull {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  lastReviewedSha: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
  body: string | null;
}

export interface PullFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PullCommit {
  sha: string;
  message: string;
  author: string;
  committedAt: Date | null;
}

function toPull(row: typeof t.pullRequests.$inferSelect): Pull {
  return {
    id: row.id,
    repoId: row.repoId,
    number: row.number,
    title: row.title,
    author: row.author,
    branch: row.branch,
    base: row.base,
    headSha: row.headSha,
    additions: row.additions,
    deletions: row.deletions,
    filesCount: row.filesCount,
    status: row.status,
    lastReviewedSha: row.lastReviewedSha,
    openedAt: row.openedAt,
    updatedAt: row.updatedAt,
    body: row.body ?? null,
  };
}

/**
 * One PR as the GitHub port hands it back.
 *
 * Derived from `PrMeta` — which is exactly what `GitHubClient.listPullRequests`
 * returns — rather than restated, so the import shape cannot drift from the
 * port's contract.
 */
export type UpsertPull = Pick<
  PrMeta,
  | 'number'
  | 'title'
  | 'author'
  | 'branch'
  | 'base'
  | 'head_sha'
  | 'additions'
  | 'deletions'
  | 'files_count'
  | 'status'
  | 'opened_at'
  | 'updated_at'
>;

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

export class PullsRepository {
  constructor(private db: Db) {}

  // ---- repos / pulls lookups ----------------------------------------------

  /** Workspace-scoped repo lookup (tenancy guard). */
  async findRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Repo by id, unscoped — only for following a PR's own `repoId` FK. */
  async findRepoById(repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  async findPull(workspaceId: string, prId: string): Promise<Pull | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row ? toPull(row) : undefined;
  }

  async listPullsByRepo(repoId: string): Promise<Pull[]> {
    const rows = await this.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repoId));
    return rows.map(toPull);
  }

  // ---- writes --------------------------------------------------------------

  /** Idempotent import (unique repo_id + number): insert new, refresh moving fields. */
  async upsertPull(workspaceId: string, repoId: string, pr: UpsertPull): Promise<void> {
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
        openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
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

  async updateDiffStats(prId: string, stats: DiffStats): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, prId));
  }

  /**
   * Replace a PR's persisted files + commits with a freshly fetched detail, and
   * refresh the columns GitHub's list payload does not carry.
   *
   * One transaction: the delete+insert pair is a replace, and a failure between
   * them would leave the PR with no files at all rather than the previous set.
   */
  async replacePullDetail(
    prId: string,
    files: { path: string; additions: number; deletions: number; patch?: string | null }[],
    commits: { sha: string; message: string; author: string; committed_at?: string | null }[],
    meta: { body: string | null } & DiffStats,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (files.length > 0) {
        await tx.insert(t.prFiles).values(
          files.map((f) => ({
            prId,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }

      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
      if (commits.length > 0) {
        await tx.insert(t.prCommits).values(
          commits.map((c) => ({
            prId,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }

      await tx
        .update(t.pullRequests)
        .set({
          body: meta.body,
          additions: meta.additions,
          deletions: meta.deletions,
          filesCount: meta.filesCount,
        })
        .where(eq(t.pullRequests.id, prId));
    });
  }

  // ---- persisted detail (offline fallback) ---------------------------------

  async listFiles(prId: string): Promise<PullFile[]> {
    const rows: PrFileRow[] = await this.db
      .select()
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    }));
  }

  async listCommits(prId: string): Promise<PullCommit[]> {
    const rows: PrCommitRow[] = await this.db
      .select()
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId));
    return rows.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committedAt: c.committedAt,
    }));
  }

  // ---- PR-list enrichment (batched) ----------------------------------------

  /** Reviews of kind 'review' for these PRs, newest first. */
  async listReviewsForPulls(
    prIds: string[],
  ): Promise<{ id: string; prId: string; runId: string | null; score: number | null; createdAt: Date }[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({
        id: t.reviews.id,
        prId: t.reviews.prId,
        runId: t.reviews.runId,
        score: t.reviews.score,
        createdAt: t.reviews.createdAt,
      })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  /** Every agent run for these PRs (any status) — used to resolve the latest round. */
  async listRunsForPulls(
    prIds: string[],
  ): Promise<{ id: string; prId: string | null; ranAt: Date }[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ id: t.agentRuns.id, prId: t.agentRuns.prId, ranAt: t.agentRuns.ranAt })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.prId, prIds));
  }

  /** Findings of the given reviews. Typed by what `summarizeFindings` consumes,
   *  so the row shape stays inside this file. */
  async listFindingsForReviews(reviewIds: string[]): Promise<FindingsInput> {
    if (reviewIds.length === 0) return [];
    return this.db.select().from(t.findings).where(inArray(t.findings.reviewId, reviewIds));
  }

  /** Cost of every SUCCESSFUL run for these PRs (lifetime spend, not one round). */
  async listDoneRunCosts(
    prIds: string[],
  ): Promise<{ prId: string | null; costUsd: number | null }[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.status, 'done')));
  }

  /**
   * Intent Layer derivation cost per PR (Q4: added additively into the PR's
   * lifetime `cost_usd`, alongside `listDoneRunCosts` — same `{ prId, costUsd }`
   * shape, so the two lists can simply be concatenated before `costByPr`).
   */
  async listIntentCosts(prIds: string[]): Promise<{ prId: string | null; costUsd: number | null }[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.prIntent.prId, costUsd: t.prIntent.costUsd })
      .from(t.prIntent)
      .where(inArray(t.prIntent.prId, prIds));
  }
}
