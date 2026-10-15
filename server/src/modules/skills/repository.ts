import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { COUNTED_STATUSES, REVIEW_RUN_SOURCE, type CountedStatus } from '../_shared/stats-rules.js';
import type {
  SkillLink,
  SkillRunFact,
  SkillRunFindings,
  SkillStatsFacts,
  SkillStatsStore,
  SkillStatsWindow,
} from './types.js';
import { INITIAL_SKILL_VERSION, RESTORE_NOTE_PREFIX } from './constants.js';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { assessSkillSafety } from './safety.js';

/** Postgres unique_violation → a 409 the client can show inline, instead of a 500. */
function rethrowUniqueViolation(err: unknown, name: string): never {
  if ((err as { code?: string } | null)?.code === '23505') {
    throw new ConflictError(`A skill named "${name}" already exists in this workspace`);
  }
  throw err;
}

/**
 * Skills data-access. Owns `skills` and `skill_versions`; the `agent_skills`
 * link table stays owned by `AgentsRepository` (the agent side — link, reorder,
 * list for one agent). Workspace-scoped throughout except `forAgent`, which is
 * addressed by a caller that already resolved the agent within its workspace.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  /** Source files the body's rules were extracted from (Conventions Extractor). */
  evidenceFiles?: string[];
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  /** Only meaningful together with `body` — carried into the new `skill_versions`
   *  row when the body actually changes. */
  note?: string | null;
  enabled?: boolean;
}

/** One skill linked to a review agent, resolved for prompt assembly. */
export interface PromptSkill {
  id: string;
  name: string;
  body: string;
  source: SkillSource;
}

/** A Project Context document pinned to a skill, by repo + catalog path. */
export interface SkillContextDocRef {
  repoId: string;
  path: string;
}

export interface SkillContextDoc extends SkillContextDocRef {
  skillId: string;
  position: number;
}

/** An agent's linked skill with the two flags that decide whether it is injected. */
export interface LinkedSkillState {
  id: string;
  name: string;
  order: number;
  enabled: boolean;
  safe: boolean;
}

const READ_ONLY_SNAPSHOT = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;

export class SkillsRepository implements SkillStatsStore {
  constructor(private db: Db) {}

  async listByWorkspace(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). `skill_versions` + `agent_skills`
   *  links cascade. Returns false if no such skill existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND its v1 body snapshot — one fact, one transaction. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(t.skills)
          .values({
            workspaceId: values.workspaceId,
            name: values.name,
            description: values.description ?? '',
            type: values.type,
            source: values.source,
            body: values.body,
            enabled: values.enabled ?? true,
            version: INITIAL_SKILL_VERSION,
            ...(values.evidenceFiles ? { evidenceFiles: values.evidenceFiles } : {}),
          })
          .returning();
        await tx.insert(t.skillVersions).values({
          skillId: row!.id,
          version: INITIAL_SKILL_VERSION,
          body: row!.body,
          note: 'Initial version',
        });
        return row!;
      });
    } catch (err) {
      rethrowUniqueViolation(err, values.name);
    }
  }

  /**
   * Update a skill. A BODY change bumps the version and snapshots the new body
   * into `skill_versions` (so eval runs and the Versions tab stay reproducible
   * against the exact text they scored). Renaming, re-typing, or toggling
   * `enabled` alone does NOT bump — same "config vs. flag" split as agents.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .update(t.skills)
          .set({
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.description !== undefined ? { description: patch.description } : {}),
            ...(patch.type !== undefined ? { type: patch.type } : {}),
            ...(patch.body !== undefined ? { body: patch.body } : {}),
            ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
            ...(bodyChanged ? { version: nextVersion } : {}),
          })
          .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
          .returning();

        if (bodyChanged && row) {
          await tx.insert(t.skillVersions).values({
            skillId: row.id,
            version: nextVersion,
            body: row.body,
            note: patch.note ?? null,
          });
        }
        return row;
      });
    } catch (err) {
      rethrowUniqueViolation(err, patch.name ?? existing.name);
    }
  }

  /**
   * Restore a past body snapshot. Implemented as an ordinary `update` (with
   * that snapshot's body) rather than rewinding — restoring APPENDS a new
   * version, so version history is never rewritten.
   */
  async restore(workspaceId: string, id: string, version: number): Promise<SkillRow | undefined> {
    const snapshot = await this.getVersion(id, version);
    if (!snapshot) return undefined;
    return this.update(workspaceId, id, {
      body: snapshot.body,
      note: `${RESTORE_NOTE_PREFIX}${version}`,
    });
  }

  // ---- skill_versions (immutable body snapshots) ---------------------------

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** A single body snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  // ---- prompt resolution (consumed by ReviewRunExecutor via SkillsReader) --

  /** Skills linked to an agent, enabled only, in `agent_skills.order` ascending. */
  async forAgent(agentId: string): Promise<PromptSkill[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order));
    return rows.filter((r) => assessSkillSafety(r.skill.body).safe).map((r) => ({
      id: r.skill.id,
      name: r.skill.name,
      body: r.skill.body,
      source: r.skill.source as SkillSource,
    }));
  }

  /** Every skill linked to an agent (enabled or not, safe or not), in `agent_skills.order`. */
  async linkedForAgentWithState(agentId: string): Promise<LinkedSkillState[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({
      id: r.skill.id,
      name: r.skill.name,
      order: r.order,
      enabled: r.skill.enabled,
      safe: assessSkillSafety(r.skill.body).safe,
    }));
  }

  // ---- skill_context_docs (Project Context attachments) -------------------
  //
  // A skill's attachments never touch `skills.version`: `version` tracks the body,
  // and an agent picks the documents up through its own version snapshot.

  /** Attached documents of a skill (all repos), in prompt order. */
  async listContextDocs(skillId: string): Promise<SkillContextDoc[]> {
    return this.listContextDocsForSkills([skillId]);
  }

  /** Attachments of several skills (optionally one repo), ordered by skill id, then position. */
  async listContextDocsForSkills(skillIds: string[], repoId?: string): Promise<SkillContextDoc[]> {
    if (skillIds.length === 0) return [];
    return this.db
      .select({
        skillId: t.skillContextDocs.skillId,
        repoId: t.skillContextDocs.repoId,
        path: t.skillContextDocs.path,
        position: t.skillContextDocs.position,
      })
      .from(t.skillContextDocs)
      .where(
        and(
          inArray(t.skillContextDocs.skillId, skillIds),
          repoId ? eq(t.skillContextDocs.repoId, repoId) : undefined,
        ),
      )
      .orderBy(asc(t.skillContextDocs.skillId), asc(t.skillContextDocs.position));
  }

  /** Replace the skill's full ordered attachment list in ONE transaction; no version change. */
  async replaceContextDocs(
    workspaceId: string,
    skillId: string,
    docs: SkillContextDocRef[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [skill] = await tx
        .select({ id: t.skills.id })
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)))
        .for('update');
      if (!skill) throw new NotFoundError('Skill not found');
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (docs.length > 0) {
        await tx.insert(t.skillContextDocs).values(
          docs.map((d, position) => ({
            skillId,
            workspaceId,
            repoId: d.repoId,
            path: d.path,
            position,
          })),
        );
      }
    });
  }

  // ---- Stats tab -------------------------------------------------------
  //
  // Every number is derived from existing tables — agent_skills for "who uses
  // it", agent_runs + run_traces (`config.skills` only) for pull and skill runs,
  // reviews/findings for outcome counts. No separate analytics table. The
  // arithmetic lives in helpers.computeSkillStats (pure); these methods only
  // fetch the facts, all from one repeatable-read, read-only snapshot.

  /** Workspace-scoped existence check for the stats route; null = unknown or foreign. */
  async skillRef(workspaceId: string, id: string): Promise<{ id: string; enabled: boolean } | null> {
    const [row] = await this.db
      .select({ id: t.skills.id, enabled: t.skills.enabled })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row ?? null;
  }

  async statsFacts(
    workspaceId: string,
    window: SkillStatsWindow,
    skillIds: string[],
  ): Promise<SkillStatsFacts> {
    if (skillIds.length === 0) return { links: [], runs: [], runFindings: [] };
    return this.db.transaction(async (tx) => {
      // (a) linked agents: agent_skills ⨝ agents of this workspace (enabled or not).
      const links: SkillLink[] = await tx
        .select({ skillId: t.agentSkills.skillId, agentId: t.agents.id, agentName: t.agents.name })
        .from(t.agentSkills)
        .innerJoin(t.agents, and(eq(t.agents.id, t.agentSkills.agentId), eq(t.agents.workspaceId, workspaceId)))
        .where(inArray(t.agentSkills.skillId, skillIds))
        .orderBy(asc(t.agents.name), asc(t.agents.id));

      // (b) counted runs at any time; only `config.skills` of the trace leaves the
      // database, and it is validated in JS (a malformed list never fails the read).
      const runRows = await tx
        .select({
          id: t.agentRuns.id,
          agentId: t.agentRuns.agentId,
          status: t.agentRuns.status,
          ranAt: t.agentRuns.ranAt,
          skills: sql<unknown>`${t.runTraces.trace}->'config'->'skills'`,
        })
        .from(t.agentRuns)
        .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
        .where(
          and(
            eq(t.agentRuns.workspaceId, workspaceId),
            eq(t.agentRuns.source, REVIEW_RUN_SOURCE),
            inArray(t.agentRuns.status, [...COUNTED_STATUSES]),
          ),
        )
        .orderBy(asc(t.agentRuns.id));
      const runs: SkillRunFact[] = runRows.map((r) => ({ ...r, status: r.status as CountedStatus }));

      // (c) decision counts per (done run in the window, category). Same join path
      // and FILTER expressions as agent-stats/repository.ts (rules in C22).
      const runFindings: SkillRunFindings[] = await tx
        .select({
          runId: t.agentRuns.id,
          category: t.findings.category,
          accepted: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)`.mapWith(Number),
          dismissed:
            sql<number>`count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is not null)`.mapWith(
              Number,
            ),
          pending:
            sql<number>`count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is null)`.mapWith(
              Number,
            ),
        })
        .from(t.agentRuns)
        .innerJoin(t.reviews, and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.workspaceId, workspaceId)))
        .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
        .where(
          and(
            eq(t.agentRuns.workspaceId, workspaceId),
            eq(t.agentRuns.source, REVIEW_RUN_SOURCE),
            eq(t.agentRuns.status, 'done'),
            gte(t.agentRuns.ranAt, window.from),
            lt(t.agentRuns.ranAt, window.to),
          ),
        )
        .groupBy(t.agentRuns.id, t.findings.category)
        .orderBy(asc(t.agentRuns.id), asc(t.findings.category));

      return { links, runs, runFindings };
    }, READ_ONLY_SNAPSHOT);
  }
}
