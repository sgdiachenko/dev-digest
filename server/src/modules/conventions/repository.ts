import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionStatus } from '@devdigest/shared';
import type { VerifiedCandidate } from './helpers.js';

import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
export type { ConventionRow, ConventionScanRow };

/**
 * Conventions data-access. Owns `conventions` + `convention_scans` only.
 *
 * Workspace-scoped throughout; `repo_id` is nullable in the `conventions`
 * schema (a workspace-wide convention is legal in principle) but every query
 * here is repo-scoped, because the extractor only ever produces repo-scoped rows.
 */
export class ConventionsRepository {
  constructor(private db: Db) {}

  // ---- conventions ----------------------------------------------------------

  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), desc(t.conventions.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /** The rows behind a skill draft, in the order they were listed. */
  async listByIds(workspaceId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is ConventionRow => !!r);
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      )
      .orderBy(desc(t.conventions.confidence));
  }

  /**
   * Replace this repo's PENDING candidates with a fresh scan's results.
   *
   * Accepted and rejected rows survive untouched — a re-scan re-proposes, it
   * does not re-litigate decisions the user already made. Not a transaction:
   * the worst interleaving here loses a pending row the next scan re-creates.
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    candidates: VerifiedCandidate[],
    scanId: string,
  ): Promise<ConventionRow[]> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'pending'),
        ),
      );
    if (candidates.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        candidates.map((c) => ({
          workspaceId,
          repoId,
          category: c.category,
          rule: c.rule,
          rationale: c.rationale,
          evidencePath: c.evidencePath,
          evidenceLine: c.evidenceLine,
          evidenceSnippet: c.evidenceSnippet,
          confidence: c.confidence,
          status: 'pending' as const,
          origin: c.origin,
          supportCount: c.supportCount,
          probe: c.probe,
          scanId,
        })),
      )
      .returning();
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { rule?: string; rationale?: string | null; status?: ConventionStatus },
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.rationale !== undefined ? { rationale: patch.rationale } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }

  /** "Deselect all" — every accepted row for this repo goes back to pending,
   *  so the board can be re-triaged into a different subset before the next
   *  skill. Returns the updated rows. */
  async deselectAllAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .update(t.conventions)
      .set({ status: 'pending' })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      )
      .returning();
  }

  // ---- convention_scans -------------------------------------------------

  async insertScan(workspaceId: string, repoId: string, jobId: string | null): Promise<ConventionScanRow> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({ workspaceId, repoId, jobId, status: 'running' })
      .returning();
    return row!;
  }

  async getScanById(workspaceId: string, id: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.id, id)));
    return row;
  }

  /** The most recent scan for a repo — the poll target. */
  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)))
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  async finishScan(
    id: string,
    patch: {
      status: 'done' | 'failed';
      sampledFiles?: string[];
      proposed?: number;
      fromConfig?: number;
      droppedUngrounded?: number;
      droppedUnsupported?: number;
      droppedDuplicate?: number;
      droppedExistingSkill?: number;
      droppedCategoryCap?: number;
      model?: string | null;
      costUsd?: number | null;
      error?: string | null;
    },
  ): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({ ...patch, finishedAt: new Date() })
      .where(eq(t.conventionScans.id, id));
  }
}
