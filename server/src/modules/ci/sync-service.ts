/**
 * Export to CI — Refresh (ingest) and the CI Runs list. Per installation it
 * reads the newest workflow runs and each run's artifact from GitHub, and
 * stores identity from the API but findings / verdict / cost / trace only from
 * a validated artifact (AC-137). Nothing here logs a token, a download URL, an
 * artifact body or a diff (NFR-9).
 */
import { CI_LIMITS, CiRefreshResponse, CiResultArtifact } from '@devdigest/shared';
import type { CiRun, CiRunArtifact, CiUnavailableReason, RepoRef } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { RESULT_ARTIFACT_PREFIX, SYNC_FAILED_CODE, WORKFLOW_FILE_NAME } from './constants.js';
import {
  deriveRunStatus,
  isAwaitingApproval,
  isRunning,
  isSha40,
  normalizeWorkflowPath,
  parseRepoRef,
  readResultEntry,
  runTiming,
  toCiError,
  toCiRun,
} from './helpers.js';
import type {
  ArtifactData,
  ArtifactWrite,
  CiGitHub,
  CiGitHubResolver,
  CiLogger,
  CiStore,
  StoredInstallation,
} from './types.js';

/** What a run's artifact turned out to be. */
interface ArtifactOutcome {
  write: ArtifactWrite;
  reason: CiUnavailableReason | null;
  /** Present only for a valid artifact (drives the stored status). */
  reported: { status: string; findingsCount: number } | null;
}

const unavailable = (reason: CiUnavailableReason): ArtifactOutcome => ({
  write: { kind: 'keep' },
  reason,
  reported: null,
});

export class CiSyncService {
  constructor(
    private readonly store: CiStore,
    private readonly github: CiGitHubResolver,
    private readonly log: CiLogger,
  ) {}

  async listRuns(workspaceId: string, limit: number): Promise<CiRun[]> {
    const items = await this.store.listRuns(workspaceId, Math.min(limit, CI_LIMITS.RUNS_PAGE_MAX));
    return items.map(toCiRun);
  }

  /** Sync every installation; one failing installation never stops the others (AC-96). */
  async refresh(workspaceId: string): Promise<CiRefreshResponse> {
    const gh = await this.github(); // throws `github_token_missing` before anything changes (AC-98)
    const installs = await this.store.allInstallations(workspaceId);
    const results: CiRefreshResponse['results'] = [];
    for (const inst of installs) {
      const progress = { stored: 0 };
      let errorCode: string | null = null;
      try {
        await this.syncInstallation(gh, inst, progress);
      } catch (err) {
        const mapped = toCiError(err);
        errorCode = mapped instanceof AppError ? mapped.code : SYNC_FAILED_CODE;
      }
      this.log[errorCode ? 'warn' : 'info'](
        {
          agent_id: inst.agentId,
          repo: inst.repo,
          outcome: errorCode ? 'error' : 'ok',
          error_code: errorCode,
          runs_stored: progress.stored,
        },
        'ci refresh',
      );
      results.push({
        installation_id: inst.id,
        repo: inst.repo,
        stored: progress.stored,
        error_code: errorCode,
      });
    }
    return CiRefreshResponse.parse({ results });
  }

  private async syncInstallation(
    gh: CiGitHub,
    inst: StoredInstallation,
    progress: { stored: number },
  ): Promise<void> {
    // Without the repository id and slug a run cannot be attributed (AC-87); older rows have neither.
    if (inst.githubRepoId === null || inst.agentSlug === null) return;
    const ref = parseRepoRef(inst.repo);
    const repoId = inst.githubRepoId;
    const artifactName = `${RESULT_ARTIFACT_PREFIX}${inst.agentSlug}`;

    const runs = await gh.ci.listWorkflowRuns(ref, WORKFLOW_FILE_NAME, CI_LIMITS.RUNS_PER_SYNC);
    for (const run of runs) {
      if (normalizeWorkflowPath(run.path) !== inst.workflowPath) continue; // AC-87
      if (run.repositoryId !== repoId) continue; // AC-87
      if (!isSha40(run.headSha)) continue; // AC-88
      if (isAwaitingApproval(run)) continue; // AC-116

      const runAttempt = run.runAttempt ?? 1; // AC-136
      const key = { installationId: inst.id, githubRepoId: repoId, workflowRunId: run.id, runAttempt };
      const timing = runTiming(run);
      const prNumber = run.pullRequests[0] ?? (await gh.ci.findPrByHead(ref, run.headSha, run.headRepo)); // AC-95, AC-114
      const base = {
        ...key,
        repo: inst.repo,
        headSha: run.headSha,
        headRepo: run.headRepo,
        prNumber,
        ranAt: timing.ranAt,
        durationS: timing.durationS,
        githubUrl: run.htmlUrl,
      };

      if (isRunning(run)) {
        await this.store.upsertRun({
          ...base,
          status: 'running',
          unavailableReason: null,
          artifact: { kind: 'keep' },
        });
        progress.stored += 1;
        continue;
      }

      const artifacts = await gh.ci.listRunArtifacts(ref, run.id);
      const mine = artifacts.find((a) => a.name === artifactName);
      if (!mine && artifacts.some((a) => a.name.startsWith(RESULT_ARTIFACT_PREFIX))) {
        // Other agents reported, this one did not: store nothing, drop a stale `running` row (AC-123, AC-124).
        await this.store.deleteRunningRun(key);
        continue;
      }

      const outcome = mine ? await this.readArtifact(gh, ref, mine) : unavailable('artifact_missing');
      await this.store.upsertRun({
        ...base,
        status: deriveRunStatus(run, outcome.reported),
        unavailableReason: outcome.reason,
        artifact: outcome.write,
      });
      progress.stored += 1;
    }
  }

  private async readArtifact(gh: CiGitHub, ref: RepoRef, artifact: CiRunArtifact): Promise<ArtifactOutcome> {
    if (artifact.expired) return unavailable('artifact_expired'); // AC-92
    if (artifact.sizeInBytes > CI_LIMITS.ARTIFACT_ARCHIVE_MAX_BYTES) return unavailable('artifact_too_large'); // AC-89, AC-138

    let archive: Uint8Array | null;
    try {
      archive = await gh.ci.downloadArtifact(ref, artifact.id, CI_LIMITS.ARTIFACT_ARCHIVE_MAX_BYTES);
    } catch (err) {
      if (err instanceof AppError && err.code === 'artifact_too_large') return unavailable('artifact_too_large');
      throw err;
    }
    if (archive === null) return unavailable('artifact_expired'); // 410 (AC-113)

    const entry = readResultEntry(archive);
    if (!entry.ok) {
      return entry.reason === 'artifact_too_large'
        ? unavailable('artifact_too_large') // AC-140
        : { write: { kind: 'clear' }, reason: 'artifact_invalid', reported: null };
    }
    const parsed = CiResultArtifact.safeParse(entry.json);
    if (!parsed.success) {
      // Includes an out-of-shape trace field (AC-91, AC-178): no number from it is kept.
      return { write: { kind: 'clear' }, reason: 'artifact_invalid', reported: null };
    }
    const a = parsed.data;
    const data: ArtifactData = {
      verdict: a.verdict,
      findingsCount: a.findings_count,
      critical: a.critical,
      warning: a.warning,
      suggestion: a.suggestion,
      costUsd: a.cost_usd,
      agentVersion: a.agent_version,
      ciFailOn: a.ci_fail_on,
      model: a.model,
      skills: a.skills,
      memorySha256: a.memory_sha256,
      manifestSha256: a.manifest_sha256,
      runnerBuild: a.runner_build,
    };
    return {
      write: { kind: 'set', data },
      reason: null,
      reported: { status: a.status, findingsCount: a.findings_count },
    };
  }
}

