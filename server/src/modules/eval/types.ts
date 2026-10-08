/**
 * Eval module ports and domain types (L06 eval pipeline).
 *
 * Ring 2/3: the services in this module take these ports, never the container
 * or a drizzle handle. `repository.ts` implements `EvalStore`; the container
 * adapts the agents / skills repositories to the two reader ports.
 */
import type {
  EvalCase,
  EvalCaseBase,
  EvalCaseResult,
  EvalCaseType,
  EvalErrorReason,
  EvalExpectation,
  EvalFindingMatch,
  EvalInputMeta,
  EvalSuiteRun,
  EvalSuiteRunConfig,
  EvalSuiteRunStatus,
  EvalSuiteRunSummary,
  EvalOverview,
  Finding,
  LLMProvider,
  Provider,
  RunTrace,
  SkillSource,
} from '@devdigest/shared';

/** The logger subset the eval services use. Never log diff / PR text / prompts / outputs (NFR-14). */
export interface EvalLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

/** Resolves a configured LLM provider; throws `ConfigError` when its key is missing. */
export type EvalLlmResolver = (provider: Provider) => Promise<LLMProvider>;

// ---- Agent / skill readers ----

/** An agent as an eval review needs it (workspace-scoped read). */
export interface EvalAgent {
  id: string;
  name: string;
  version: number;
  provider: Provider;
  model: string;
  strategy: string;
  system_prompt: string;
}

export interface EvalAgentReader {
  /** `null` when the agent does not exist in the workspace. */
  get(workspaceId: string, agentId: string): Promise<EvalAgent | null>;
}

/** A skill linked to an agent, with the version it had when read. */
export interface EvalPinnedSkill {
  id: string;
  name: string;
  body: string;
  source: SkillSource;
  version: number;
}

export interface EvalSkillsReader {
  forAgentWithVersion(agentId: string): Promise<EvalPinnedSkill[]>;
}

// ---- Pinned inputs of a run ----

/** The agent configuration frozen at the start of an attempt / suite run. */
export interface PinnedConfig {
  agent_id: string;
  agent_version: number;
  provider: Provider;
  model: string;
  strategy: string;
  system_prompt: string;
  skills: EvalPinnedSkill[];
  /** The temperature actually sent; `null` when the provider ignores it. */
  temperature: number | null;
}

/** The case inputs frozen at the start of a suite run (held in memory). */
export interface PinnedCase {
  /** `null` for an unpersisted attempt on a draft. */
  id: string | null;
  name: string;
  type: EvalCaseType;
  input_diff: string;
  input_meta: EvalInputMeta;
  expectations: EvalExpectation[];
}

// ---- Scoring ----

/** Result of scoring ONE case — pure, no LLM. */
export interface CaseScore {
  status: 'pass' | 'fail' | 'error';
  /** Expectations hit by at least one kept finding. */
  matched: number;
  /** One entry per kept finding, in input order. */
  matches: EvalFindingMatch[];
  expected_count: number;
  actual_count: number;
  dropped_count: number;
  error_reason: EvalErrorReason | null;
}

/** A scored case plus the measurements `aggregate` needs. */
export interface CaseOutcome extends CaseScore {
  type: EvalCaseType;
  cost_usd: number | null;
  duration_ms: number | null;
}

/** Run-level roll-up of case outcomes. */
export interface RunAggregate {
  status: Extract<EvalSuiteRunStatus, 'completed' | 'partial' | 'failed'>;
  cases_total: number;
  /** Cases that finished without `error`. */
  cases_completed: number;
  cases_errored: number;
  cases_passed: number | null;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
}

// ---- Draft ----

/** Everything the draft builder needs about a triaged finding. */
export interface DraftSource {
  finding: Finding & { accepted_at: string | null; dismissed_at: string | null };
  review: { id: string; agent_id: string | null; run_id: string | null; pr_id: string };
  pr: {
    title: string;
    body: string | null;
    number: number;
    repo_id: string;
    repo_full_name: string | null;
  };
  agent: { id: string; name: string } | null;
}

// ---- Persistence port ----

export interface NewEvalCase extends EvalCaseBase {
  owner_kind: 'agent' | 'skill';
  owner_id: string;
}

export interface CaseResultRecord {
  case_id: string;
  status: 'pass' | 'fail' | 'error' | 'timeout';
  result: EvalCaseResult;
}

export interface RunFinish extends RunAggregate {
  finished_at: string;
  error_reason: string | null;
}

/** All persistence of the eval module (implemented by `repository.ts`). */
export interface EvalStore {
  // cases
  listCases(workspaceId: string, agentId: string): Promise<EvalCase[]>;
  getCase(workspaceId: string, caseId: string): Promise<EvalCase | null>;
  countCases(workspaceId: string, agentId: string): Promise<number>;
  insertCase(workspaceId: string, input: NewEvalCase): Promise<EvalCase>;
  updateCase(workspaceId: string, caseId: string, input: EvalCaseBase): Promise<EvalCase | null>;
  deleteCase(workspaceId: string, caseId: string): Promise<boolean>;
  findCaseBySourceFinding(
    workspaceId: string,
    agentId: string,
    findingId: string,
  ): Promise<{ id: string; name: string } | null>;

  // draft context
  getDraftSource(workspaceId: string, findingId: string): Promise<DraftSource | null>;
  getRunTrace(workspaceId: string, runId: string): Promise<Pick<RunTrace, 'prompt_assembly'> | null>;
  /** Persisted `pr_files` patches of a PR, in path order. */
  getPrPatches(workspaceId: string, prId: string): Promise<Array<{ path: string; patch: string | null }>>;

  // suite runs
  /** One transaction: the run (`queued`) and a `queued` row per case. Throws `run_active` on conflict. */
  createRunWithCases(
    workspaceId: string,
    run: { agent_id: string; agent_version: number; config: EvalSuiteRunConfig; case_ids: string[] },
  ): Promise<{ run_id: string }>;
  markRunRunning(runId: string): Promise<void>;
  setCaseRunning(runId: string, caseId: string): Promise<void>;
  /** Touches 0 rows (returns `false`) when the case was deleted meanwhile. */
  saveCaseResult(runId: string, record: CaseResultRecord): Promise<boolean>;
  finishRun(runId: string, finish: RunFinish): Promise<void>;
  getRun(workspaceId: string, runId: string): Promise<EvalSuiteRun | null>;
  listRuns(
    workspaceId: string,
    agentId: string,
    opts: { since?: string; limit: number },
  ): Promise<EvalSuiteRunSummary[]>;
  activeRun(workspaceId: string, agentId: string): Promise<{ id: string } | null>;
  recentRuns(workspaceId: string, limit: number): Promise<EvalOverview['recent_runs']>;
  agentsOverview(workspaceId: string): Promise<EvalOverview['agents']>;
  /** Boot sweep: `queued` / `running` -> `interrupted`, metrics `null`. Returns the count. */
  reapActiveRuns(): Promise<number>;
}
