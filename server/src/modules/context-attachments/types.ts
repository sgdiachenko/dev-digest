/**
 * context-attachments ports and domain types.
 *
 *   - `AgentContextStore` / `SkillContextStore` — persistence ports; AgentsRepository and
 *     SkillsRepository satisfy them structurally (wired in the container).
 *   - `ProjectContextForRun` — the read port the run executor takes.
 */
import type { ProjectDoc } from '@devdigest/reviewer-core';
import type { ProjectContextTrace } from '@devdigest/shared';
import type { ScanLogger } from '../project-context/types.js';

/** A document pinned to an agent or skill, by repo + catalog path. */
export interface DocRef {
  repoId: string;
  path: string;
}

export interface OrderedDocRef extends DocRef {
  position: number;
}

export interface SkillOrderedDocRef extends OrderedDocRef {
  skillId: string;
}

/** An agent's linked skill with the two flags that decide whether it is injected. */
export interface LinkedSkill {
  id: string;
  name: string;
  order: number;
  enabled: boolean;
  safe: boolean;
}

export interface AgentContextStore {
  /** Workspace-scoped existence check (tenancy guard). */
  getById(workspaceId: string, id: string): Promise<{ id: string } | undefined>;
  /** Enabled agents of the workspace, ordered by `created_at`, `id`. */
  listEnabledIdsOrdered(workspaceId: string): Promise<{ id: string }[]>;
  listContextDocs(agentId: string): Promise<OrderedDocRef[]>;
  replaceContextDocs(
    workspaceId: string,
    agentId: string,
    docs: DocRef[],
  ): Promise<{ changed: boolean; version: number }>;
}

export interface SkillContextStore {
  getById(workspaceId: string, id: string): Promise<{ id: string } | undefined>;
  listContextDocs(skillId: string): Promise<SkillOrderedDocRef[]>;
  /** Ordered by skill id, then position. */
  listContextDocsForSkills(skillIds: string[], repoId?: string): Promise<SkillOrderedDocRef[]>;
  replaceContextDocs(workspaceId: string, skillId: string, docs: DocRef[]): Promise<void>;
  linkedForAgentWithState(agentId: string): Promise<LinkedSkill[]>;
}

export interface ProjectContextForRunInput {
  workspaceId: string;
  agentId: string;
  repoId: string;
  /** The skills actually injected into this run's prompt, in `agent_skills.order`. */
  injectedSkills: { id: string; name: string }[];
}

export type ProjectContextUnavailableReason = 'no_clone' | 'no_catalog' | 'timeout' | 'error';

export type RunContextResult =
  | { kind: 'none' }
  | { kind: 'unavailable'; reason: ProjectContextUnavailableReason }
  | {
      kind: 'resolved';
      sha: string;
      /** Documents to inject, in prompt order, before the engine's own character fit. */
      docs: ProjectDoc[];
      trace: ProjectContextTrace;
      /** Injected documents carrying a catalog secret warning (paths only). */
      secretPaths: string[];
      /** Every candidate was unreadable / missing / too large: nothing was read. */
      allReadsFailed: boolean;
    };

export interface ProjectContextForRun {
  /** Never rejects: any failure is reported as `unavailable`. Logs paths/sizes/reasons only. */
  resolveForRun(input: ProjectContextForRunInput, logger?: ScanLogger): Promise<RunContextResult>;
}

/** The documents attached anywhere in a repo, for a consumer that is not a review run. */
export type RepoContextResult =
  | { kind: 'none' }
  | { kind: 'unavailable'; reason: ProjectContextUnavailableReason }
  | {
      kind: 'resolved';
      sha: string;
      /** Readable documents in merge order (agents by creation, own before skills), no budget applied. */
      docs: { path: string; text: string; estTokens: number | null }[];
    };

export interface ProjectContextForRepo {
  /** Never rejects: any failure is reported as `unavailable`. Logs paths/counts/reasons only. */
  resolveForRepo(workspaceId: string, repoId: string, logger?: ScanLogger): Promise<RepoContextResult>;
}
