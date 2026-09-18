import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import type { StatsAgentRow, StatsFindingRow, StatsRunRow, SkillStatsRaw } from './helpers.js';
import { INITIAL_SKILL_VERSION, RESTORE_NOTE_PREFIX, STATS_WINDOW_DAYS } from './constants.js';
import { ConflictError } from '../../platform/errors.js';

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

export class SkillsRepository {
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
    return rows.map((r) => ({
      id: r.skill.id,
      name: r.skill.name,
      body: r.skill.body,
      source: r.skill.source as SkillSource,
    }));
  }

  // ---- Stats tab -------------------------------------------------------
  //
  // Every number is derived from existing tables — agent_skills for "who uses
  // it", reviews/findings for outcome counts, agent_runs + run_traces for pull
  // frequency (trace.config.skills, written by the run executor). No separate
  // analytics table. The arithmetic itself lives in helpers.computeSkillStats
  // (pure, unit-tested); these methods only fetch the raw rows.

  /** Raw stats inputs for ONE skill. */
  async statsRawFor(workspaceId: string, skillId: string): Promise<SkillStatsRaw> {
    const map = await this.statsRawForMany(workspaceId, [skillId]);
    return map.get(skillId) ?? { skillId, agents: [], findings: [], runs: [] };
  }

  /**
   * Raw stats inputs for MANY skills in one round-trip (the `GET /skills` rail
   * — no request-per-card). Fetches each cross-cutting table once, scoped to
   * the union of linked agents, then partitions per skill in memory; skill
   * counts in this starter are small enough that this beats N+1 queries
   * without needing a raw jsonb-aggregate query.
   */
  async statsRawForMany(workspaceId: string, skillIds: string[]): Promise<Map<string, SkillStatsRaw>> {
    const out = new Map<string, SkillStatsRaw>(skillIds.map((id) => [id, { skillId: id, agents: [], findings: [], runs: [] }]));
    if (skillIds.length === 0) return out;

    const links = await this.db
      .select({ skillId: t.agentSkills.skillId, agentId: t.agentSkills.agentId })
      .from(t.agentSkills)
      .where(inArray(t.agentSkills.skillId, skillIds));
    if (links.length === 0) return out;

    const agentIds = [...new Set(links.map((l) => l.agentId))];
    const agents: StatsAgentRow[] = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), inArray(t.agents.id, agentIds)));
    const agentById = new Map(agents.map((a) => [a.id, a]));

    const cutoff = new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const findingRows = await this.db
      .select({
        agentId: t.reviews.agentId,
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          inArray(t.reviews.agentId, agentIds),
          gte(t.reviews.createdAt, cutoff),
        ),
      );

    const runRows = await this.db
      .select({ agentId: t.agentRuns.agentId, trace: t.runTraces.trace })
      .from(t.agentRuns)
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.agentRuns.agentId, agentIds)));

    for (const skillId of skillIds) {
      const skillAgentIds = new Set(links.filter((l) => l.skillId === skillId).map((l) => l.agentId));
      const skillAgents = [...skillAgentIds]
        .map((id) => agentById.get(id))
        .filter((a): a is StatsAgentRow => a !== undefined);
      const skillFindings: StatsFindingRow[] = findingRows
        .filter((f) => f.agentId !== null && skillAgentIds.has(f.agentId))
        .map((f) => ({ category: f.category, acceptedAt: f.acceptedAt, dismissedAt: f.dismissedAt }));
      const skillRuns: StatsRunRow[] = runRows
        .filter((r) => r.agentId !== null && skillAgentIds.has(r.agentId))
        .map((r) => ({ trace: r.trace }));
      out.set(skillId, { skillId, agents: skillAgents, findings: skillFindings, runs: skillRuns });
    }
    return out;
  }
}
