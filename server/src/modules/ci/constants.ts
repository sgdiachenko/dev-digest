/** Export to CI — module constants. Limits live in `CI_LIMITS` (`@devdigest/shared`). */

export const CI_PR_TITLE = 'Add DevDigest CI review';
export const CI_COMMIT_MESSAGE = 'Add DevDigest CI review';

/** Basename of the shared workflow file (`CI_PATHS.WORKFLOW`'s last segment). */
export const WORKFLOW_FILE_NAME = 'devdigest-review.yml';

export const AGENTS_DIR = '.devdigest/agents';
export const SKILLS_DIR = '.devdigest/skills';
export const MEMORY_PATH = '.devdigest/memory.jsonl';

export const RESULT_FILE_NAME = 'devdigest-result.json';
/** Artifact name is this prefix + the agent slug. */
export const RESULT_ARTIFACT_PREFIX = 'devdigest-result-';

/** CI runs only use OpenRouter (the key lives in the repo's Actions secrets). */
export const CI_PROVIDER = 'openrouter';

export const DEFAULT_AGENT_SLUG = 'agent';
export const SLUG_MAX_LENGTH = 64;

/** `owner/name` — the only shape accepted before it reaches a GitHub path. */
export const REPO_FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const HEX40_RE = /^[0-9a-fA-F]{40}$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Workflow-run states that mean "not finished". */
export const RUNNING_STATUSES: readonly string[] = ['queued', 'in_progress', 'pending', 'requested'];
/** Runs held for maintainer approval (inference, Q-20): never stored. */
export const AWAITING_APPROVAL_STATUSES: readonly string[] = ['waiting', 'action_required'];

/** Stable per-installation error code when nothing more specific is known. */
export const SYNC_FAILED_CODE = 'sync_failed';
