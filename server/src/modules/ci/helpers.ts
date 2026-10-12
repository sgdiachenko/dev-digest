/** Export to CI — pure helpers (no I/O, no persistence). */
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import {
  CI_LIMITS,
  CiInstallation,
  CiRun,
  CiSkillEntry,
  CiTrigger,
  CiRunStatus,
} from '@devdigest/shared';
import type { RepoRef, CiWorkflowRun } from '@devdigest/shared';
import { AppError, ValidationError } from '../../platform/errors.js';
import {
  AWAITING_APPROVAL_STATUSES,
  DEFAULT_AGENT_SLUG,
  HEX40_RE,
  REPO_FULL_NAME_RE,
  RESULT_FILE_NAME,
  RUNNING_STATUSES,
  SLUG_MAX_LENGTH,
} from './constants.js';
import type {
  CiAgent,
  ExportSnapshot,
  RunListItem,
  StoredInstallation,
  StoredRun,
} from './types.js';

// ---- slugs / hashes --------------------------------------------------------

/** `slugify(name)`: lowercase `[a-z0-9-]`, no leading/trailing/double dash, never empty. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug || DEFAULT_AGENT_SLUG;
}

/** Slugs of `names` in order; a repeat gets `-2`, `-3`, … */
export function uniqueSlugs(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const base = slugify(name);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

export function sha256Hex(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

/** The git blob SHA-1 GitHub reports for a file with these UTF-8 contents. */
export function gitBlobSha(contents: string): string {
  const bytes = Buffer.from(contents, 'utf8');
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

// ---- input ----------------------------------------------------------------

/** `owner/name` → ref. Anything else is a 422 before it can reach a GitHub path. */
export function parseRepoRef(repo: string): RepoRef {
  if (!REPO_FULL_NAME_RE.test(repo)) {
    throw new ValidationError('repo must look like "owner/name"');
  }
  const [owner, name] = repo.split('/') as [string, string];
  return { owner, name };
}

export function parsePrNumber(url: string): number | null {
  const m = /\/pull\/(\d+)(?:[/?#]|$)/.exec(url);
  return m ? Number(m[1]) : null;
}

/** Canonical trigger order, deduplicated. */
export function unionTriggers(...lists: CiTrigger[][]): CiTrigger[] {
  const all = new Set(lists.flat());
  return CiTrigger.options.filter((t) => all.has(t));
}

// ---- GitHub errors ----------------------------------------------------------

const SCOPE_MESSAGE =
  'GitHub refused the request. A classic token needs the scopes `repo` and `workflow`; ' +
  'a fine-grained token needs `Contents: write`, `Workflows: write`, `Pull requests: write` and `Actions: read`.';

/**
 * Map a failed GitHub call to a stable `AppError`; anything that is not an
 * HTTP/timeout failure is returned unchanged (a bug must not masquerade as
 * GitHub). Messages are fixed strings — nothing from the response (which can
 * embed URLs) is copied into them.
 */
export function toCiError(err: unknown): unknown {
  if (err instanceof AppError) return err;
  const e = err as { status?: unknown; name?: unknown; code?: unknown; message?: unknown };
  const status = typeof e?.status === 'number' ? e.status : undefined;
  if (status === 404) {
    return new AppError(
      'repo_not_accessible',
      'The repository does not exist, or the GitHub token cannot access it.',
      404,
    );
  }
  if (status === 403) {
    if (typeof e.message === 'string' && /rate limit/i.test(e.message)) {
      return new AppError('github_unavailable', 'GitHub rate limit reached. Try again later.', 503);
    }
    return new AppError('github_scope_missing', SCOPE_MESSAGE, 403);
  }
  if (status === 401) {
    return new AppError('github_token_invalid', 'The GitHub token was rejected. Update it in Settings.', 400);
  }
  if (status === 429 || (status !== undefined && status >= 500)) {
    return new AppError('github_unavailable', 'GitHub is unavailable or rate limited. Try again later.', 503);
  }
  const code = typeof e?.code === 'string' ? e.code : '';
  if (e?.name === 'TimeoutError' || ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(code)) {
    return new AppError('github_unavailable', 'GitHub is unavailable or rate limited. Try again later.', 503);
  }
  if (status !== undefined) {
    return new AppError('github_error', 'GitHub rejected the request.', 502);
  }
  return err;
}

/** Same error with a note that the branch was already left behind (AC-129). */
export function withBranchNote(err: unknown, branch: string): unknown {
  if (!(err instanceof AppError)) return err;
  return new AppError(
    err.code,
    `${err.message} The branch "${branch}" was already created and was left in place.`,
    err.statusCode,
    err.details,
  );
}

// ---- computed installation / run views ---------------------------------------

export function isOutdated(agent: Pick<CiAgent, 'version'>, inst: Pick<StoredInstallation, 'agentVersion'>): boolean {
  return inst.agentVersion < agent.version;
}

export function isPendingUpdate(agent: Pick<CiAgent, 'ciFailOn'>, inst: Pick<StoredInstallation, 'ciFailOn'>): boolean {
  return inst.ciFailOn !== agent.ciFailOn;
}

function sameSkills(a: CiSkillEntry[], b: CiSkillEntry[]): boolean {
  return a.length === b.length && a.every((s, i) => s.slug === b[i]!.slug && s.sha256 === b[i]!.sha256);
}

/**
 * The run reported another agent version / model / skill set than the
 * installation's current snapshot (AC-180, AC-181). Never true without a
 * manifest hash (AC-182) or without a snapshot to compare with.
 */
export function differsFromExport(run: StoredRun, snapshot: ExportSnapshot | null): boolean {
  if (!snapshot || run.manifestSha256 === null) return false;
  if (run.agentVersion !== null && run.agentVersion !== snapshot.agentVersion) return true;
  if (run.model !== null && run.model !== snapshot.exportedModel) return true;
  if (run.skills !== null && !sameSkills(run.skills, snapshot.exportedSkills)) return true;
  return false;
}

export function toCiRun(item: RunListItem): CiRun {
  const r = item.run;
  return CiRun.parse({
    id: r.id,
    ci_installation_id: r.installationId,
    repo: r.repo,
    pr_number: r.prNumber,
    head_sha: r.headSha,
    workflow_run_id: r.workflowRunId,
    run_attempt: r.runAttempt,
    ran_at: r.ranAt,
    duration_s: r.durationS,
    status: r.status,
    verdict: r.verdict,
    findings_count: r.findingsCount,
    critical: r.critical,
    warning: r.warning,
    suggestion: r.suggestion,
    cost_usd: r.costUsd,
    agent: item.agentName,
    agent_version: r.agentVersion,
    github_url: r.githubUrl,
    source: 'gha',
    unavailable_reason: r.unavailableReason,
    model: r.model,
    ci_fail_on: r.ciFailOn,
    skills: r.skills,
    memory_sha256: r.memorySha256,
    manifest_sha256: r.manifestSha256,
    runner_build: r.runnerBuild,
    differs_from_export: differsFromExport(r, item.snapshot),
  });
}

export function toCiInstallation(
  inst: StoredInstallation,
  agent: Pick<CiAgent, 'version' | 'ciFailOn'>,
  latest: RunListItem | undefined,
): CiInstallation {
  return CiInstallation.parse({
    id: inst.id,
    agent_id: inst.agentId,
    repo: inst.repo,
    target_type: inst.targetType,
    installed_at: inst.installedAt,
    agent_version: inst.agentVersion,
    ci_fail_on: inst.ciFailOn,
    post_as: inst.postAs,
    triggers: inst.triggers,
    workflow_path: inst.workflowPath,
    pr_url: inst.prUrl,
    outdated: isOutdated(agent, inst),
    pending_update: isPendingUpdate(agent, inst),
    latest_run: latest ? toCiRun(latest) : null,
    exported_model: inst.exportedModel,
    exported_skills: inst.exportedSkills,
  });
}

// ---- sync helpers -----------------------------------------------------------

export function isSha40(sha: string): boolean {
  return HEX40_RE.test(sha);
}

/** GitHub may report `path@ref` for PR-triggered runs. */
export function normalizeWorkflowPath(path: string): string {
  const at = path.indexOf('@');
  return at === -1 ? path : path.slice(0, at);
}

export function isAwaitingApproval(run: Pick<CiWorkflowRun, 'status'>): boolean {
  return run.status !== null && AWAITING_APPROVAL_STATUSES.includes(run.status);
}

export function isRunning(run: Pick<CiWorkflowRun, 'status'>): boolean {
  return run.status === null || RUNNING_STATUSES.includes(run.status);
}

/** AC-86 — the run's stored status. `artifactStatus` is only known for a valid artifact. */
export function deriveRunStatus(
  run: Pick<CiWorkflowRun, 'status' | 'conclusion'>,
  artifact: { status: string; findingsCount: number } | null,
): CiRunStatus {
  if (isRunning(run)) return 'running';
  if (artifact?.status === 'skipped') return 'skipped';
  if (run.conclusion === 'success') return artifact && artifact.findingsCount === 0 ? 'no_findings' : 'succeeded';
  if (run.conclusion === 'cancelled') return 'cancelled';
  return 'failed';
}

export function runTiming(run: CiWorkflowRun): { ranAt: Date | null; durationS: number | null } {
  const startIso = run.runStartedAt ?? run.createdAt;
  const start = startIso ? new Date(startIso) : null;
  const ranAt = start && !Number.isNaN(start.getTime()) ? start : null;
  if (isRunning(run) || !ranAt || !run.updatedAt) return { ranAt, durationS: null };
  const end = new Date(run.updatedAt).getTime();
  const seconds = (end - ranAt.getTime()) / 1000;
  return { ranAt, durationS: Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 10) / 10 : null };
}

export type ResultEntry =
  | { ok: true; json: unknown }
  | { ok: false; reason: 'artifact_too_large' | 'artifact_invalid' };

/**
 * Read only `devdigest-result.json` from an artifact archive (AC-90). Two
 * passes: the first reads the declared size without inflating anything, so an
 * oversized entry is refused before a byte is decompressed (AC-139, AC-140).
 */
export function readResultEntry(archive: Uint8Array): ResultEntry {
  const entry: { size: number | null } = { size: null };
  try {
    unzipSync(archive, {
      filter: (f) => {
        if (f.name === RESULT_FILE_NAME) entry.size = f.originalSize;
        return false;
      },
    });
    if (entry.size === null) return { ok: false, reason: 'artifact_invalid' };
    if (entry.size > CI_LIMITS.RESULT_ENTRY_MAX_BYTES) return { ok: false, reason: 'artifact_too_large' };
    const files = unzipSync(archive, {
      filter: (f) => f.name === RESULT_FILE_NAME && f.originalSize <= CI_LIMITS.RESULT_ENTRY_MAX_BYTES,
    });
    const bytes = files[RESULT_FILE_NAME];
    if (!bytes) return { ok: false, reason: 'artifact_invalid' };
    if (bytes.length > CI_LIMITS.RESULT_ENTRY_MAX_BYTES) return { ok: false, reason: 'artifact_too_large' };
    return { ok: true, json: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, reason: 'artifact_invalid' };
  }
}
