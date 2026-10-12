/**
 * Export to CI — the export use case. Takes ports only (store, agent reader,
 * runner-bundle source, GitHub resolver, logger); never the container.
 *
 * `files` builds the bundle and returns it: no GitHub call, nothing stored
 * (AC-37). `open_pr` writes only to `devdigest/ci` (AC-24) and records an
 * installation only after the PR exists (AC-33).
 */
import {
  CI_LIMITS,
  CI_PATHS,
  CiExport,
  CiExportInput,
  CiInstallation,
} from '@devdigest/shared';
import type { RunnerBundleSource } from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { agentManifestPath, buildBundle, type Bundle } from './bundle.js';
import { CI_COMMIT_MESSAGE, CI_PROVIDER, SKILLS_DIR } from './constants.js';
import {
  gitBlobSha,
  parsePrNumber,
  parseRepoRef,
  slugify,
  toCiError,
  toCiInstallation,
  unionTriggers,
  withBranchNote,
} from './helpers.js';
import type {
  CiAgent,
  CiAgentReader,
  CiGitHubResolver,
  CiLogger,
  CiStore,
  StoredInstallation,
} from './types.js';

/**
 * Files this agent's previous export wrote that the new bundle no longer
 * contains: the old manifest after a rename, skills dropped from the agent.
 * A skill another agent in the repo still exports is never a candidate.
 */
function staleCandidates(
  previous: StoredInstallation,
  others: StoredInstallation[],
  newPaths: Set<string>,
): string[] {
  const sharedSkills = new Set(others.flatMap((o) => o.exportedSkills.map((s) => s.slug)));
  const candidates = [
    ...(previous.agentSlug ? [agentManifestPath(previous.agentSlug)] : []),
    ...previous.exportedSkills
      .filter((s) => !sharedSkills.has(s.slug))
      .map((s) => `${SKILLS_DIR}/${s.slug}.md`),
  ];
  return candidates.filter((p) => !newPaths.has(p));
}

/** One export per repository at a time: concurrent commits would overwrite each other's files. */
const exportsInFlight = new Set<string>();

export class CiService {
  constructor(
    private readonly store: CiStore,
    private readonly agents: CiAgentReader,
    private readonly runner: RunnerBundleSource,
    private readonly github: CiGitHubResolver,
    private readonly log: CiLogger,
  ) {}

  async exportCi(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiExport> {
    const agent = await this.agents.get(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    if (input.action === 'files') return this.preview(workspaceId, agent, input);

    const key = `${workspaceId}:${input.repo}`;
    if (exportsInFlight.has(key)) {
      throw new AppError(
        'export_in_progress',
        `An export to ${input.repo} is already running. Retry in a moment.`,
        409,
      );
    }
    exportsInFlight.add(key);
    try {
      const out = await this.install(workspaceId, agent, input);
      this.log.info(
        { agent_id: agent.id, repo: input.repo, outcome: out.pr_reused ? 'reused' : 'opened', error_code: null, runs_stored: 0 },
        'ci export',
      );
      return out;
    } catch (err) {
      this.log.warn(
        {
          agent_id: agent.id,
          repo: input.repo,
          outcome: 'error',
          error_code: err instanceof AppError ? err.code : 'internal_error',
          runs_stored: 0,
        },
        'ci export',
      );
      throw err;
    } finally {
      exportsInFlight.delete(key);
    }
  }

  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    const agent = await this.agents.get(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const installs = await this.store.installationsForAgent(workspaceId, agentId);
    const latest = await this.store.latestRuns(installs.map((i) => i.id));
    return installs.map((i) => toCiInstallation(i, agent, latest.get(i.id)));
  }

  // ---- preview ---------------------------------------------------------------

  private async preview(workspaceId: string, agent: CiAgent, input: CiExportInput): Promise<CiExport> {
    this.validate(input);
    const { bundle } = await this.prepare(workspaceId, agent, input);
    return CiExport.parse({
      installation: null,
      files: bundle.files,
      pr_url: null,
      pr_number: null,
      pr_reused: false,
    });
  }

  // ---- install ---------------------------------------------------------------

  private async install(workspaceId: string, agent: CiAgent, input: CiExportInput): Promise<CiExport> {
    // 1. token (400, no GitHub call) · 2. target · 3. workflow override · 4. provider
    const gh = await this.github();
    this.validate(input);
    if (agent.provider !== CI_PROVIDER) {
      throw new AppError(
        'provider_not_supported',
        'CI runs use OpenRouter. Switch the agent provider to OpenRouter on the Config tab.',
        422,
      );
    }
    // 5. the bundle (503 `runner_bundle_unavailable` before any GitHub call)
    const { bundle, others } = await this.prepare(workspaceId, agent, input);
    const ref = parseRepoRef(input.repo);
    const branch = CI_PATHS.BRANCH;

    const guard = async <T>(fn: () => Promise<T>, branchExists = false): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        const mapped = toCiError(err);
        throw branchExists ? withBranchNote(mapped, branch) : mapped;
      }
    };

    // 6. read the repo, the branch and its PR
    const repoInfo = await guard(() => gh.ci.getRepo(ref));
    const branchExists = await guard(() => gh.ci.branchExists(ref, branch));
    const openPr = branchExists ? await guard(() => gh.github.findOpenPr(ref, branch)) : null;
    if (branchExists && !openPr) {
      throw new AppError(
        'branch_exists_without_pr',
        `The branch "${branch}" already exists without an open pull request. Delete the branch or open a PR from it, then retry.`,
        409,
      );
    }
    // 7. another agent already uses this slug in the repo
    if (others.some((o) => o.agentSlug === bundle.agentSlug)) {
      throw new AppError(
        'agent_slug_conflict',
        `Another agent installed in ${input.repo} already uses the slug "${bundle.agentSlug}". Rename one of the agents.`,
        409,
      );
    }

    // 8. files this agent's previous export left behind, present on the branch
    // we are about to commit to (the open PR's branch, else the default branch)
    const previous = (await this.store.installationsForAgent(workspaceId, agent.id)).find(
      (i) => i.repo === input.repo,
    );
    const stale = previous
      ? staleCandidates(previous, others, new Set(bundle.files.map((f) => f.path)))
      : [];
    const staleOnTarget: Record<string, string | null> =
      stale.length > 0
        ? await guard(() =>
            gh.ci.readBranchFiles(ref, openPr ? branch : repoInfo.defaultBranch, stale),
          )
        : {};
    const deletes = stale.filter((p) => staleOnTarget[p] != null);

    // 9. commit + PR
    let prUrl: string;
    let reused: boolean;
    if (openPr) {
      const current = await guard(
        () => gh.ci.readBranchFiles(ref, branch, bundle.files.map((f) => f.path)),
        true,
      );
      const changed = bundle.files.filter((f) => current[f.path] !== gitBlobSha(f.contents));
      if (changed.length > 0 || deletes.length > 0) {
        await guard(
          () =>
            gh.github.commitFiles(ref, {
              branch,
              base: repoInfo.defaultBranch,
              message: CI_COMMIT_MESSAGE,
              files: changed.map((f) => ({ path: f.path, contents: f.contents })),
              deletes,
            }),
          true,
        );
      }
      prUrl = openPr.url;
      reused = true;
    } else {
      await guard(() =>
        gh.github.commitFiles(ref, {
          branch,
          base: repoInfo.defaultBranch,
          message: CI_COMMIT_MESSAGE,
          files: bundle.files.map((f) => ({ path: f.path, contents: f.contents })),
          deletes,
        }),
      );
      const pr = await guard(
        () =>
          gh.github.openPullRequest(ref, {
            title: bundle.prTitle,
            head: branch,
            base: repoInfo.defaultBranch,
            body: bundle.prBody,
          }),
        true,
      );
      prUrl = pr.url;
      reused = false;
    }

    // 10. record the installation + export-time snapshot (only now)
    const installation = await this.store.upsertInstallation({
      agentId: agent.id,
      repo: input.repo,
      githubRepoId: repoInfo.id,
      agentSlug: bundle.agentSlug,
      agentVersion: agent.version,
      ciFailOn: agent.ciFailOn,
      postAs: input.post_as,
      triggers: input.triggers,
      workflowPath: CI_PATHS.WORKFLOW,
      prUrl,
      prNumber: parsePrNumber(prUrl),
      exportedModel: agent.model,
      exportedSkills: bundle.skills,
    });

    return CiExport.parse({
      installation: toCiInstallation(installation, agent, undefined),
      files: bundle.files,
      pr_url: prUrl,
      pr_number: parsePrNumber(prUrl),
      pr_reused: reused,
    });
  }

  // ---- shared ----------------------------------------------------------------

  /** Target must be `gha`; a workflow replacement must be non-empty and ≤ 64 KB (AC-34, AC-36). */
  private validate(input: CiExportInput): void {
    if (input.target !== 'gha') {
      throw new ValidationError('Only the GitHub Actions target is supported');
    }
    const wf = input.workflow_contents;
    if (wf !== undefined && wf !== null) {
      if (wf.trim().length === 0) throw new ValidationError('The workflow file must not be empty');
      if (Buffer.byteLength(wf, 'utf8') > CI_LIMITS.WORKFLOW_EDIT_MAX_BYTES) {
        throw new ValidationError(
          `The workflow file must be at most ${CI_LIMITS.WORKFLOW_EDIT_MAX_BYTES / 1024} KB`,
        );
      }
    }
  }

  private async prepare(
    workspaceId: string,
    agent: CiAgent,
    input: CiExportInput,
  ): Promise<{ bundle: Bundle; others: StoredInstallation[] }> {
    parseRepoRef(input.repo); // 422 on a malformed repo before any read
    const runnerFiles = await this.runner.read();
    const [skills, memory, installs] = await Promise.all([
      this.store.linkedSkills(agent.id),
      this.store.listMemory(workspaceId, input.repo, CI_LIMITS.MEMORY_ITEMS_MAX),
      this.store.installationsForRepo(workspaceId, input.repo),
    ]);
    const others = installs.filter((i) => i.agentId !== agent.id);
    const slug = slugify(agent.name);
    const bundle = buildBundle(
      {
        agent,
        skills,
        memory,
        postAs: input.post_as,
        triggers: input.triggers,
        workflowTriggers: unionTriggers(input.triggers, ...others.map((o) => o.triggers)),
        installedSlugs: [slug, ...others.flatMap((o) => (o.agentSlug ? [o.agentSlug] : []))],
        runnerFiles,
        workflowOverride: input.workflow_contents ?? null,
      },
      input.repo,
    );
    return { bundle, others };
  }
}

