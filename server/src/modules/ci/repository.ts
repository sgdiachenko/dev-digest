/**
 * Export to CI data-access. The ONLY layer of the ci module that touches the DB.
 * Implements `CiStore`; every method maps rows to domain types (rows never leave
 * this file) and is workspace-scoped through the agent that owns the installation.
 *
 * Reads `skills` / `agent_skills` / `memory` / `repos` / `agents` directly
 * rather than another module's repository (no sideways imports).
 */
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CI_PATHS,
  CiFailOn,
  CiRunStatus,
  CiSkillEntry,
  CiTrigger,
  CiUnavailableReason,
  MemorySource,
  Verdict,
} from '@devdigest/shared';
import type { MemoryItem, SkillSource } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  CiSkillSource,
  CiStore,
  PostAs,
  RunKey,
  RunListItem,
  RunWrite,
  StoredInstallation,
  StoredRun,
  UpsertInstallation,
} from './types.js';

type InstallationRow = typeof t.ciInstallations.$inferSelect;
type RunRow = typeof t.ciRuns.$inferSelect;

const PostAsSchema = z.enum(['github_review', 'pr_comment', 'none']);
const TriggersSchema = z.array(CiTrigger).min(1);
const SkillEntries = z.array(CiSkillEntry);

function toInstallation(row: InstallationRow): StoredInstallation {
  return {
    id: row.id,
    agentId: row.agentId,
    repo: row.repo,
    githubRepoId: row.githubRepoId,
    targetType: row.targetType,
    agentSlug: row.agentSlug,
    agentVersion: row.agentVersion ?? 0,
    ciFailOn: CiFailOn.safeParse(row.ciFailOn).data ?? 'critical',
    postAs: (PostAsSchema.safeParse(row.postAs).data ?? 'github_review') as PostAs,
    triggers: TriggersSchema.safeParse(row.triggers).data ?? [...CiTrigger.options],
    workflowPath: row.workflowPath ?? CI_PATHS.WORKFLOW,
    prUrl: row.prUrl,
    prNumber: row.prNumber,
    exportedModel: row.exportedModel ?? '',
    exportedSkills: SkillEntries.safeParse(row.exportedSkills).data ?? [],
    installedAt: row.installedAt.toISOString(),
  };
}

function toRun(row: RunRow): StoredRun {
  return {
    id: row.id,
    installationId: row.ciInstallationId,
    repo: row.repo ?? '',
    prNumber: row.prNumber,
    headSha: row.headSha ?? '',
    workflowRunId: row.workflowRunId ?? 0,
    runAttempt: row.runAttempt,
    ranAt: row.ranAt ? row.ranAt.toISOString() : null,
    durationS: row.durationS,
    status: CiRunStatus.safeParse(row.status).data ?? 'failed',
    verdict: Verdict.safeParse(row.verdict).data ?? null,
    findingsCount: row.findingsCount,
    critical: row.critical,
    warning: row.warning,
    suggestion: row.suggestion,
    costUsd: row.costUsd,
    agentVersion: row.agentVersion,
    githubUrl: row.githubUrl ?? '',
    unavailableReason: CiUnavailableReason.safeParse(row.unavailableReason).data ?? null,
    model: row.model,
    ciFailOn: CiFailOn.safeParse(row.ciFailOn).data ?? null,
    skills: SkillEntries.safeParse(row.skills).data ?? null,
    memorySha256: row.memorySha256,
    manifestSha256: row.manifestSha256,
    runnerBuild: row.runnerBuild,
  };
}

function toRunItem(run: RunRow, inst: InstallationRow | null, agentName: string | null): RunListItem {
  return {
    run: toRun(run),
    agentName,
    snapshot: inst
      ? {
          agentVersion: inst.agentVersion ?? 0,
          exportedModel: inst.exportedModel ?? '',
          exportedSkills: SkillEntries.safeParse(inst.exportedSkills).data ?? [],
        }
      : null,
  };
}

const NEWEST_FIRST = [sql`${t.ciRuns.ranAt} desc nulls last`, desc(t.ciRuns.id)] as const;

export class CiRepository implements CiStore {
  constructor(private db: Db) {}

  async linkedSkills(agentId: string): Promise<CiSkillSource[]> {
    const rows = await this.db
      .select({ name: t.skills.name, source: t.skills.source, body: t.skills.body })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ name: r.name, source: r.source as SkillSource, body: r.body }));
  }

  async listMemory(workspaceId: string, repoFullName: string, limit: number): Promise<MemoryItem[]> {
    const rows = await this.db
      .select({ m: t.memory })
      .from(t.memory)
      .leftJoin(t.repos, eq(t.memory.repoId, t.repos.id))
      .where(
        and(
          eq(t.memory.workspaceId, workspaceId),
          or(eq(t.memory.scope, 'global'), eq(t.repos.fullName, repoFullName)),
        ),
      )
      .orderBy(desc(t.memory.createdAt), desc(t.memory.id))
      .limit(limit);
    return rows.map(({ m }) => ({
      content: m.content,
      scope: m.scope,
      kind: m.kind,
      confidence: Math.min(1, Math.max(0, m.confidence ?? 0)),
      sources: z.array(MemorySource).catch([]).parse(m.sources),
    }));
  }

  async installationsForRepo(workspaceId: string, repo: string): Promise<StoredInstallation[]> {
    const rows = await this.db
      .select({ i: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.repo, repo)));
    return rows.map((r) => toInstallation(r.i));
  }

  async installationsForAgent(workspaceId: string, agentId: string): Promise<StoredInstallation[]> {
    const rows = await this.db
      .select({ i: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)))
      .orderBy(asc(t.ciInstallations.installedAt), asc(t.ciInstallations.id));
    return rows.map((r) => toInstallation(r.i));
  }

  async allInstallations(workspaceId: string): Promise<StoredInstallation[]> {
    const rows = await this.db
      .select({ i: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.ciInstallations.installedAt), asc(t.ciInstallations.id));
    return rows.map((r) => toInstallation(r.i));
  }

  async upsertInstallation(input: UpsertInstallation): Promise<StoredInstallation> {
    const values = {
      agentId: input.agentId,
      repo: input.repo,
      githubRepoId: input.githubRepoId,
      targetType: 'gha' as const,
      agentSlug: input.agentSlug,
      agentVersion: input.agentVersion,
      ciFailOn: input.ciFailOn,
      postAs: input.postAs,
      triggers: input.triggers,
      workflowPath: input.workflowPath,
      prUrl: input.prUrl,
      prNumber: input.prNumber,
      exportedModel: input.exportedModel,
      exportedSkills: input.exportedSkills,
    };
    const { agentId: _a, repo: _r, ...updatable } = values;
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values(values)
      .onConflictDoUpdate({
        target: [t.ciInstallations.agentId, t.ciInstallations.repo],
        set: { ...updatable, updatedAt: new Date() },
      })
      .returning();
    return toInstallation(row!);
  }

  async upsertRun(w: RunWrite): Promise<void> {
    const identity = {
      repo: w.repo,
      headSha: w.headSha,
      headRepo: w.headRepo,
      prNumber: w.prNumber,
      ranAt: w.ranAt,
      durationS: w.durationS,
      status: w.status,
      githubUrl: w.githubUrl,
      source: 'gha',
      unavailableReason: w.unavailableReason,
    };
    const NULLED = {
      verdict: null,
      findingsCount: null,
      critical: null,
      warning: null,
      suggestion: null,
      costUsd: null,
      agentVersion: null,
      model: null,
      ciFailOn: null,
      skills: null,
      memorySha256: null,
      manifestSha256: null,
      runnerBuild: null,
    };
    const artifact =
      w.artifact.kind === 'set'
        ? {
            verdict: w.artifact.data.verdict,
            findingsCount: w.artifact.data.findingsCount,
            critical: w.artifact.data.critical,
            warning: w.artifact.data.warning,
            suggestion: w.artifact.data.suggestion,
            costUsd: w.artifact.data.costUsd,
            agentVersion: w.artifact.data.agentVersion,
            model: w.artifact.data.model,
            ciFailOn: w.artifact.data.ciFailOn,
            skills: w.artifact.data.skills,
            memorySha256: w.artifact.data.memorySha256,
            manifestSha256: w.artifact.data.manifestSha256,
            runnerBuild: w.artifact.data.runnerBuild,
          }
        : w.artifact.kind === 'clear'
          ? NULLED
          : null; // keep: leave the stored columns alone (AC-93)
    await this.db
      .insert(t.ciRuns)
      .values({
        ciInstallationId: w.installationId,
        githubRepoId: w.githubRepoId,
        workflowRunId: w.workflowRunId,
        runAttempt: w.runAttempt,
        ...identity,
        ...(artifact ?? NULLED),
      })
      .onConflictDoUpdate({
        target: [
          t.ciRuns.githubRepoId,
          t.ciRuns.workflowRunId,
          t.ciRuns.runAttempt,
          t.ciRuns.ciInstallationId,
        ],
        set: { ...identity, ...(artifact ?? {}) },
      });
  }

  async deleteRunningRun(key: RunKey): Promise<void> {
    await this.db
      .delete(t.ciRuns)
      .where(
        and(
          eq(t.ciRuns.ciInstallationId, key.installationId),
          eq(t.ciRuns.githubRepoId, key.githubRepoId),
          eq(t.ciRuns.workflowRunId, key.workflowRunId),
          eq(t.ciRuns.runAttempt, key.runAttempt),
          eq(t.ciRuns.status, 'running'),
        ),
      );
  }

  /**
   * Runs of the workspace's installations, plus runs whose installation was
   * deleted with its agent (`ci_installation_id` is set null, so they carry no
   * workspace of their own — acceptable for the single-workspace local MVP).
   */
  async listRuns(workspaceId: string, limit: number): Promise<RunListItem[]> {
    const rows = await this.db
      .select({ run: t.ciRuns, inst: t.ciInstallations, agentName: t.agents.name })
      .from(t.ciRuns)
      .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .leftJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(or(isNull(t.ciRuns.ciInstallationId), eq(t.agents.workspaceId, workspaceId)))
      .orderBy(...NEWEST_FIRST)
      .limit(limit);
    return rows.map((r) => toRunItem(r.run, r.inst, r.agentName));
  }

  async latestRuns(installationIds: string[]): Promise<Map<string, RunListItem>> {
    const out = new Map<string, RunListItem>();
    if (installationIds.length === 0) return out;
    const rows = await this.db
      .selectDistinctOn([t.ciRuns.ciInstallationId], {
        run: t.ciRuns,
        inst: t.ciInstallations,
        agentName: t.agents.name,
      })
      .from(t.ciRuns)
      .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .leftJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(inArray(t.ciRuns.ciInstallationId, installationIds))
      .orderBy(t.ciRuns.ciInstallationId, ...NEWEST_FIRST);
    for (const r of rows) {
      if (r.run.ciInstallationId) out.set(r.run.ciInstallationId, toRunItem(r.run, r.inst, r.agentName));
    }
    return out;
  }
}
