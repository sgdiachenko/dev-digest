import { z } from 'zod';
import type {
  ModelInfo,
  PrMeta,
  PrDetail,
  IssueMeta,
  PrReviewComment,
} from './contracts/platform.js';

/**
 * Adapter interfaces. ALL external calls go behind these interfaces.
 * Real implementations live in `apps/api/src/adapters/*`; mock implementations
 * live alongside for tests/dev (Services depend on the interface, not the impl).
 */

// ---------- LLM ----------
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

/**
 * Structured-output request. `schema` is a Zod schema; `schemaName` names the
 * tool / json_schema. `maxRetries` controls reprompt-on-error.
 */
export interface StructuredRequest<T> {
  model: string;
  schema: z.ZodType<T>;
  schemaName: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * HTTP-level retries of the underlying SDK, per request (429/5xx). Unset ⇒
   * the provider default. `0` makes a single attempt end-to-end.
   */
  httpRetries?: number;
  /**
   * OpenRouter only: route exclusively to providers that support structured
   * output (`provider.require_parameters`). Unset ⇒ unrestricted routing.
   */
  requireStructuredProviders?: boolean;
  /**
   * OpenRouter session id — groups related generations (e.g. all map-reduce
   * chunks of one review) into a session in the OpenRouter dashboard. Sent as
   * the `session_id` body field; ignored by providers that don't support it.
   */
  sessionId?: string;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  raw: string;
  attempts: number;
}

export interface LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'openrouter';
  listModels(): Promise<ModelInfo[]>;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  embed(texts: string[]): Promise<number[][]>;
}

// ---------- Embedder ----------
export interface Embedder {
  /** OpenAI text-embedding-3-small → 1536 dims. */
  embed(texts: string[]): Promise<number[][]>;
  readonly dims: number;
}

// ---------- GitHub (Octokit REST, thin) ----------
export interface RepoRef {
  owner: string;
  name: string;
}

export interface GitHubReviewPayload {
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments?: { path: string; line: number; body: string }[];
}

/** Create one standalone inline review comment (or a reply to a thread). */
export interface CreateReviewCommentInput {
  /** Head commit the comment pins to (GitHub requires commit_id). */
  commitId: string;
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
  body: string;
  /** When set, post as a reply to that comment's thread instead of a new one. */
  inReplyTo?: number;
}

export interface OpenPrPayload {
  title: string;
  head: string;
  base: string;
  body: string;
}

/** A single file to write in a commit (path relative to repo root + UTF-8 text). */
export interface CommitFile {
  path: string;
  contents: string;
}

export interface CommitFilesPayload {
  /** Branch to create-or-update with the commit (e.g. "devdigest/ci"). */
  branch: string;
  /** Base branch to fork from when `branch` does not yet exist (e.g. "main"). */
  base: string;
  message: string;
  files: CommitFile[];
  /** Paths removed from the branch in the same commit; each must exist on it. */
  deletes?: string[];
}

export interface GitHubClient {
  listPullRequests(repo: RepoRef): Promise<PrMeta[]>;
  getPullRequest(repo: RepoRef, n: number): Promise<PrDetail>;
  postReview(repo: RepoRef, n: number, review: GitHubReviewPayload): Promise<{ id: string }>;
  /** List inline review comments on a PR (for the "Files changed" tab). */
  listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]>;
  /** Create one inline review comment (or reply) on a PR; returns the new comment. */
  createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment>;
  openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }>;
  /**
   * Commit `files` onto `branch` as ONE atomic commit (Git Data API: blobs →
   * tree → commit → ref). Creates the branch from `base` if missing, else
   * fast-forwards it. Idempotent: re-publishing just adds a new commit.
   */
  commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }>;
  /** The open PR whose head is `branch`, if any (so re-publish reuses it). */
  findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null>;
  getIssue(repo: RepoRef, n: number): Promise<IssueMeta>;
  /** GET /user — for "posting as @user". */
  currentLogin(): Promise<string>;
  /**
   * Commits that touched `path`, most-recent first (PR History, P3/E6) — a
   * thin GitHub REST read, not the `pull_requests` table (which only holds
   * PRs imported into DevDigest, not a repo's full history).
   */
  listCommitsForPath(repo: RepoRef, path: string, perPage: number): Promise<{ sha: string }[]>;
  /** PRs associated with a commit (may include still-open/unmerged PRs — the
   *  caller filters those out). */
  listPullRequestsForCommit(
    repo: RepoRef,
    sha: string,
  ): Promise<{ number: number; title: string; merged_at: string | null; author: string }[]>;
}

// ---------- GitHub CI reads (Export to CI) ----------
/** A workflow run as the CI sync needs it — identity + timing from the API only. */
export interface CiWorkflowRun {
  id: number;
  /** `null` when GitHub omits the field (treated as attempt 1). */
  runAttempt: number | null;
  headSha: string;
  /** `owner/name` of the head repository; `null` when it was deleted. */
  headRepo: string | null;
  /** Id of the repository the run belongs to. */
  repositoryId: number;
  /** Workflow file path as GitHub reports it (may carry an `@ref` suffix). */
  path: string;
  status: string | null;
  conclusion: string | null;
  htmlUrl: string;
  runStartedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** PR numbers GitHub attached to the run (empty for fork-PR runs). */
  pullRequests: number[];
}

export interface CiRunArtifact {
  id: number;
  name: string;
  expired: boolean;
  sizeInBytes: number;
}

/**
 * Read-side GitHub port for Export to CI. The write side (`commitFiles`,
 * `openPullRequest`, `findOpenPr`) stays on `GitHubClient`. No method retries
 * (NFR-5); errors carry the HTTP `status` for the caller to map.
 */
export interface GitHubCiClient {
  /** Repository id + default branch. A missing/forbidden repo rejects with status 404. */
  getRepo(repo: RepoRef): Promise<{ id: number; defaultBranch: string }>;
  branchExists(repo: RepoRef, branch: string): Promise<boolean>;
  /**
   * Git blob SHA of each requested path at the head of `branch` (`null` when
   * the path is absent) — compared with locally computed blob SHAs so an
   * unchanged bundle adds no commit.
   */
  readBranchFiles(
    repo: RepoRef,
    branch: string,
    paths: string[],
  ): Promise<Record<string, string | null>>;
  /** Newest-first runs of the workflow file `workflowFile` (basename). */
  listWorkflowRuns(repo: RepoRef, workflowFile: string, perPage: number): Promise<CiWorkflowRun[]>;
  listRunArtifacts(repo: RepoRef, runId: number): Promise<CiRunArtifact[]>;
  /**
   * Download an artifact archive. Follows the short-lived redirect at once and
   * never returns or logs its URL. `null` = gone (410). Rejects with an
   * `AppError` code `artifact_too_large` when the body exceeds `maxBytes`.
   */
  downloadArtifact(repo: RepoRef, artifactId: number, maxBytes: number): Promise<Uint8Array | null>;
  /** PR number whose head SHA and head repository match, else `null`. */
  findPrByHead(repo: RepoRef, headSha: string, headRepo: string | null): Promise<number | null>;
}

// ---------- Runner bundle (prebuilt agent-runner files) ----------
export interface RunnerBundleFile {
  /** File name inside `.devdigest/runner/` (e.g. `index.js`). */
  name: string;
  contents: string;
}

export interface RunnerBundleSource {
  /**
   * Every shipped runner file, in `CI_PATHS.RUNNER_FILES` order. Rejects with
   * an `AppError` (`runner_bundle_unavailable`, 503) when any file is missing.
   */
  read(): Promise<RunnerBundleFile[]>;
}

// ---------- Git (simple-git, heavy) ----------
export interface CloneOptions {
  depth?: number;
  branch?: string;
}

export interface DiffHunk {
  file: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Lines present in the *new* file covered by this hunk (for grounding). */
  newLineNumbers: number[];
}

export interface UnifiedDiff {
  raw: string;
  files: { path: string; additions: number; deletions: number; hunks: DiffHunk[] }[];
}

export interface BlameLine {
  line: number;
  sha: string;
  author: string;
  date: string;
  summary: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

/** One entry of `git ls-tree -r -l`. `size` is null for non-blobs (`-`). */
export interface GitTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  oid: string;
  size: number | null;
}

/** One `git grep` hit: file path (relative to the repo root) and 1-based line. */
export interface GitGrepMatch {
  path: string;
  line: number;
}

export interface GitGrepOptions {
  /** Restrict the search to these paths/globs (after `--`). */
  pathspecs?: string[];
  ignoreCase?: boolean;
  /** `git grep -m`: stop after N matching lines per file. */
  maxPerFile?: number;
  /** Cap on returned matches overall. */
  maxResults?: number;
}

export interface GitClient {
  clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }>;
  fetchPullHead(repo: RepoRef, n: number): Promise<void>;
  /**
   * Resync an already-cloned repo to the tip of `branch`: fetch from origin and
   * advance the local working tree to `origin/<branch>`. Unlike `clone`'s bare
   * `fetch` (which only moves remote-tracking refs), this moves local HEAD so a
   * subsequent index reflects the latest code. Returns the new HEAD sha.
   */
  sync(repo: RepoRef, branch: string): Promise<{ head: string }>;
  currentHead(repo: RepoRef): Promise<string>;
  diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff>;
  /**
   * Names of files changed between two commits (`git diff --name-only base..head`).
   * Two-dot form is intentional — we want files reachable from `head` but not `base`,
   * matching the incremental indexer's "what moved since last_indexed_sha?" semantics.
   * Returns an empty array when the two refs resolve to the same commit.
   */
  diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]>;
  blame(repo: RepoRef, path: string): Promise<BlameLine[]>;
  log(repo: RepoRef, path?: string): Promise<GitCommit[]>;
  readFile(repo: RepoRef, path: string): Promise<string>;
  /**
   * `git show <ref>:<path>` — the file's content AT a specific commit, unlike
   * `readFile` (which reads the current working tree). Used by the Intent
   * Layer to read a linked/changed spec doc at the PR's head sha without
   * requiring the working tree to be checked out to that commit.
   *
   * `ref` MUST be a (possibly abbreviated) git sha, `path` MUST be a relative,
   * traversal-free path — implementations guard both before shelling out.
   *
   * `maxBytes`, when given, is enforced BEFORE the read (a blob-size check),
   * not by truncating the result after a potentially huge file was already
   * read in full — implementations reject with an error identifiable as
   * "too large" (e.g. `BlobTooLargeError`) rather than silently truncating.
   */
  showFileAt(repo: RepoRef, ref: string, path: string, maxBytes?: number): Promise<string>;
  /**
   * Recursive listing of the git tree at commit `sha` (`git ls-tree -r -l`).
   * Reads git objects only — never the working tree. `sha` MUST be a hex sha
   * (guarded before shelling out). Includes symlinks (mode `120000`) and
   * gitlinks (type `commit`); the caller filters.
   */
  listTree(repo: RepoRef, sha: string): Promise<GitTreeEntry[]>;
  /**
   * Raw bytes of the blob `oid` (git object, not the working tree). `oid` MUST
   * be a full 40/64-char hex object id. `maxBytes`, when given, is enforced
   * BEFORE the read (`cat-file -s`) and rejects with `BlobTooLargeError`.
   */
  readBlob(repo: RepoRef, oid: string, maxBytes?: number): Promise<Uint8Array>;
  /**
   * `git grep` over the git tree at commit `sha` — git objects only, never the
   * working tree; repo content is searched, never executed. `sha` MUST be a hex
   * sha, every pattern is passed via `-e` (no NUL), `pathspecs` are relative,
   * traversal-free paths (all guarded before shelling out). Binary files are
   * skipped; no match ⇒ `[]`. Results are in git's (path, line) order, capped at
   * `maxResults`.
   */
  grepAt(repo: RepoRef, sha: string, patterns: string[], opts?: GitGrepOptions): Promise<GitGrepMatch[]>;
  clonePathFor(repo: RepoRef): string;
}

// ---------- Tokenizer ----------
/** Token counter (approximate, model-agnostic). Never throws. */
export interface Tokenizer {
  count(text: string): number;
}

// ---------- CodeIndex (ripgrep + tree-sitter) ----------
export interface CodeMatch {
  path: string;
  line: number;
  text: string;
}

export interface CodeSymbol {
  path: string;
  name: string;
  kind: string;
  line: number;
}

export interface CodeReference {
  fromPath: string;
  toSymbol: string;
  line: number;
}

export interface CodeIndex {
  grep(repo: RepoRef, pattern: string): Promise<CodeMatch[]>;
  symbols(repo: RepoRef): Promise<CodeSymbol[]>;
  references(repo: RepoRef, symbol: string): Promise<CodeReference[]>;
}

// ---------- Auth (pluggable; MVP = LocalNoAuthProvider) ----------
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthWorkspace {
  id: string;
  name: string;
}

export interface AuthProvider {
  currentUser(req: unknown): Promise<AuthUser>;
  currentWorkspace(req: unknown): Promise<AuthWorkspace>;
}

// ---------- Secrets (pluggable; MVP = LocalSecretsProvider) ----------
export type SecretKey =
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'GITHUB_TOKEN'
  | 'DATABASE_URL'
  | (string & {});

export interface SecretsProvider {
  get(key: SecretKey): Promise<string | undefined>;
  /**
   * Persist a secret (BYO key entered via the UI). Optional — read-only
   * providers (e.g. the env-only MVP backend) may omit it.
   */
  set?(key: SecretKey, value: string): Promise<void>;
}
