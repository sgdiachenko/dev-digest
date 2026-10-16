/**
 * Skill Stats — domain types and ports (ring 2/3). `SkillStatsService` takes
 * these ports, never the container or a drizzle handle; `SkillsRepository`
 * implements `SkillStatsStore`.
 */
import type { CountedStatus } from '../_shared/stats-rules.js';

/** The `[from, to)` period a skill's figures cover. */
export interface SkillStatsWindow {
  from: Date;
  to: Date;
}

/** One agent linked to a skill now (enabled or not), workspace-scoped. */
export interface SkillLink {
  skillId: string;
  agentId: string;
  agentName: string;
}

/** One counted run of the workspace; `agentId` is null once its agent was deleted. */
export interface SkillRunFact {
  id: string;
  agentId: string | null;
  status: CountedStatus;
  ranAt: Date;
  /** Raw `trace.config.skills` — decided in JS by `isRecordedSkillList`, never in SQL. */
  skills: unknown;
}

/** Decision counts of the findings of one `done` run in the window, per category. */
export interface SkillRunFindings {
  runId: string;
  category: string;
  accepted: number;
  dismissed: number;
  pending: number;
}

/** Everything one consistent read of skill stats returns. */
export interface SkillStatsFacts {
  links: SkillLink[];
  /** Counted runs at any time (one scan serves the window figures and `last_used_at`). */
  runs: SkillRunFact[];
  runFindings: SkillRunFindings[];
}

/** Read-only persistence port; `statsFacts` answers from one consistent read. */
export interface SkillStatsStore {
  /** `null` when the skill is not in the workspace. */
  skillRef(workspaceId: string, id: string): Promise<{ id: string; enabled: boolean } | null>;
  statsFacts(workspaceId: string, window: SkillStatsWindow, skillIds: string[]): Promise<SkillStatsFacts>;
}

/** The logger subset the service uses. Never log finding text or a skill body. */
export interface SkillStatsLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
}
