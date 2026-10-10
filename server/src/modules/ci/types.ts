/**
 * Export to CI — module domain types and ports (ring 2/3). The services take
 * these ports, never the container or a drizzle handle; `repository.ts`
 * implements `CiStore`, the container adapts the agents repository to
 * `CiAgentReader` and resolves GitHub.
 */
import type {
  CiFailOn,
  CiRunStatus,
  CiSkillEntry,
  CiTarget,
  CiTrigger,
  CiUnavailableReason,
  GitHubClient,
  GitHubCiClient,
  MemoryItem,
  Provider,
  ReviewStrategy,
  SkillSource,
  Verdict,
} from '@devdigest/shared';

export type PostAs = 'github_review' | 'pr_comment' | 'none';

/** The logger subset the CI services use. Never log tokens, URLs, artifact bodies or diffs (NFR-9). */
export interface CiLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
}

/** GitHub clients for one request; the resolver throws `github_token_missing` (400) without a token. */
export interface CiGitHub {
  github: GitHubClient;
  ci: GitHubCiClient;
}
export type CiGitHubResolver = () => Promise<CiGitHub>;

// ---- Agent reader ----------------------------------------------------------

export interface CiAgent {
  id: string;
  name: string;
  version: number;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
}

export interface CiAgentReader {
  /** `null` when the agent does not exist in the workspace. */
  get(workspaceId: string, agentId: string): Promise<CiAgent | null>;
}

/** An enabled skill linked to the agent, as the bundle needs it. */
export interface CiSkillSource {
  name: string;
  source: SkillSource;
  body: string;
}

// ---- Installations ---------------------------------------------------------

export interface StoredInstallation {
  id: string;
  agentId: string;
  repo: string;
  githubRepoId: number | null;
  targetType: CiTarget;
  agentSlug: string | null;
  agentVersion: number;
  ciFailOn: CiFailOn;
  postAs: PostAs;
  triggers: CiTrigger[];
  workflowPath: string;
  prUrl: string | null;
  prNumber: number | null;
  exportedModel: string;
  exportedSkills: CiSkillEntry[];
  installedAt: string;
}

export interface UpsertInstallation {
  agentId: string;
  repo: string;
  githubRepoId: number;
  agentSlug: string;
  agentVersion: number;
  ciFailOn: CiFailOn;
  postAs: PostAs;
  triggers: CiTrigger[];
  workflowPath: string;
  prUrl: string | null;
  prNumber: number | null;
  exportedModel: string;
  exportedSkills: CiSkillEntry[];
}

// ---- Runs ------------------------------------------------------------------

/** What the artifact reported (all of it already schema-validated). */
export interface ArtifactData {
  verdict: Verdict | null;
  findingsCount: number;
  critical: number;
  warning: number;
  suggestion: number;
  costUsd: number | null;
  agentVersion: number | null;
  ciFailOn: CiFailOn | null;
  model: string | null;
  skills: CiSkillEntry[];
  memorySha256: string | null;
  manifestSha256: string | null;
  runnerBuild: string;
}

/** How a run write treats the artifact-derived columns. */
export type ArtifactWrite =
  | { kind: 'keep' } // unavailable artifact: stored numbers stay (AC-93)
  | { kind: 'clear' } // invalid artifact: numbers and trace are nulled (AC-91, AC-178)
  | { kind: 'set'; data: ArtifactData };

export interface RunWrite {
  installationId: string;
  repo: string;
  githubRepoId: number;
  workflowRunId: number;
  runAttempt: number;
  headSha: string;
  headRepo: string | null;
  prNumber: number | null;
  ranAt: Date | null;
  durationS: number | null;
  status: CiRunStatus;
  githubUrl: string;
  unavailableReason: CiUnavailableReason | null;
  artifact: ArtifactWrite;
}

export interface RunKey {
  installationId: string;
  githubRepoId: number;
  workflowRunId: number;
  runAttempt: number;
}

export interface StoredRun {
  id: string;
  installationId: string | null;
  repo: string;
  prNumber: number | null;
  headSha: string;
  workflowRunId: number;
  runAttempt: number;
  ranAt: string | null;
  durationS: number | null;
  status: CiRunStatus;
  verdict: Verdict | null;
  findingsCount: number | null;
  critical: number | null;
  warning: number | null;
  suggestion: number | null;
  costUsd: number | null;
  agentVersion: number | null;
  githubUrl: string;
  unavailableReason: CiUnavailableReason | null;
  model: string | null;
  ciFailOn: CiFailOn | null;
  skills: CiSkillEntry[] | null;
  memorySha256: string | null;
  manifestSha256: string | null;
  runnerBuild: string | null;
}

/** The installation's current export snapshot — what `differs_from_export` compares against. */
export interface ExportSnapshot {
  agentVersion: number;
  exportedModel: string;
  exportedSkills: CiSkillEntry[];
}

export interface RunListItem {
  run: StoredRun;
  /** `null` once the agent (or the installation) is gone. */
  agentName: string | null;
  snapshot: ExportSnapshot | null;
}

export interface CiStore {
  /** Enabled skills linked to the agent, in `agent_skills.order`. */
  linkedSkills(agentId: string): Promise<CiSkillSource[]>;
  /** Memory with scope `global` or belonging to `repoFullName`, newest first, at most `limit`. */
  listMemory(workspaceId: string, repoFullName: string, limit: number): Promise<MemoryItem[]>;
  installationsForRepo(workspaceId: string, repo: string): Promise<StoredInstallation[]>;
  installationsForAgent(workspaceId: string, agentId: string): Promise<StoredInstallation[]>;
  allInstallations(workspaceId: string): Promise<StoredInstallation[]>;
  upsertInstallation(input: UpsertInstallation): Promise<StoredInstallation>;
  /** Idempotent on (github repo id, run id, attempt, installation). */
  upsertRun(write: RunWrite): Promise<void>;
  /** Delete the stored row of that run only when it is still `running`. */
  deleteRunningRun(key: RunKey): Promise<void>;
  /** Newest `ran_at` first. */
  listRuns(workspaceId: string, limit: number): Promise<RunListItem[]>;
  /** The newest stored run per installation id. */
  latestRuns(installationIds: string[]): Promise<Map<string, RunListItem>>;
}
