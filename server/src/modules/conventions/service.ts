import type {
  CodeIndex,
  FeatureModelChoice,
  GitClient,
  LLMProvider,
  Provider,
  RepoRef,
} from '@devdigest/shared';
import type {
  ConventionCandidate,
  ConventionScan,
  ConventionSkillDraft,
  ConventionStatus,
} from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { RepoRow, SkillRow } from '../../db/rows.js';
import type { RepoIntel } from '../repo-intel/types.js';
import type { JobRunner } from '../../platform/jobs.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import { ConventionsRepository, type ConventionScanRow } from './repository.js';
import {
  buildSkillDraft,
  capPerCategory,
  dedupeCandidates,
  extractRuleLinesFromSkillBody,
  renderSamples,
  ruleKey,
  toCandidateDto,
  toSampledFile,
  verifyCandidate,
  type SampledFile,
  type VerifiedCandidate,
} from './helpers.js';
import { deriveConfigRules } from './config-rules.js';
import { buildProbePattern, confidenceFromSupport } from './frequency.js';
import { ExtractionSchema, buildSystemPrompt, buildUserPrompt } from './prompt.js';
import {
  CONFIG_SAMPLE_PATHS,
  CONVENTIONS_EXTRACT_JOB_KIND,
  EXTRACT_MAX_TOKENS,
  EXTRACT_TEMPERATURE,
  EXTRACT_TIMEOUT_MS,
  MAX_SAMPLE_CHARS,
  PROBE_GREP_TIMEOUT_MS,
  TOP_CODE_SAMPLES,
} from './constants.js';

/** What this module needs from the repos store — declared HERE, by the
 *  consumer, so this module stays decoupled from how repos are stored. */
export interface ReposReader {
  getById(workspaceId: string, id: string): Promise<RepoRow | undefined>;
}

/** What this module needs from the skills store, for Lever C's dedupe against
 *  rules already folded into an existing `type: 'convention'` skill. */
export interface SkillsReader {
  listByWorkspace(workspaceId: string): Promise<SkillRow[]>;
}

function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    status: row.status as ConventionScan['status'],
    sampled_files: row.sampledFiles ?? [],
    proposed: row.proposed,
    from_config: row.fromConfig,
    dropped_ungrounded: row.droppedUngrounded,
    dropped_unsupported: row.droppedUnsupported,
    dropped_duplicate: row.droppedDuplicate,
    dropped_existing_skill: row.droppedExistingSkill,
    dropped_category_cap: row.droppedCategoryCap,
    model: row.model,
    cost_usd: row.costUsd,
    error: row.error,
    started_at: row.createdAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}

/**
 * Conventions Extractor.
 *
 * Three stages, and only the middle one is a model:
 *   1. SAMPLE  — code picks the files (configs + repo-intel's top-ranked
 *                source files). The model never browses the repo.
 *   2. PROPOSE — one cheap structured call over that sample, PLUS a parallel,
 *                model-free pass over the same config files (Lever A).
 *   3. VERIFY  — code re-reads the cited file and drops any candidate whose
 *                snippet is not really there, then re-grounds confidence in a
 *                real repo-wide occurrence count (Lever B) and caps/dedupes
 *                (Lever C).
 *
 * The model call runs on the job queue (`POST .../extract` returns 202
 * immediately); SAMPLE is cheap pure I/O and runs synchronously up front so an
 * unsampleable repo 422s before any job is even created.
 */
export class ConventionsService {
  constructor(
    private readonly repo: ConventionsRepository,
    private readonly repos: ReposReader,
    private readonly skills: SkillsReader,
    private readonly repoIntel: RepoIntel,
    private readonly git: GitClient,
    private readonly codeIndex: CodeIndex,
    private readonly jobs: JobRunner,
    private readonly llmFor: (provider: Provider) => Promise<LLMProvider>,
    private readonly modelFor: (workspaceId: string) => Promise<FeatureModelChoice>,
  ) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listForRepo(workspaceId, repoId);
    return rows.map(toCandidateDto);
  }

  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScan | undefined> {
    const row = await this.repo.latestScan(workspaceId, repoId);
    return row ? toScanDto(row) : undefined;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { rule?: string; rationale?: string | null; status?: ConventionStatus },
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toCandidateDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async deselectAllAccepted(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.deselectAllAccepted(workspaceId, repoId);
    return rows.map(toCandidateDto);
  }

  /**
   * Kick off a scan: SAMPLE runs synchronously (cheap, pure I/O) so an
   * unsampleable repo 422s immediately; PROPOSE + VERIFY run on the job queue
   * because the model call is the slow, costly part.
   */
  async startExtraction(workspaceId: string, repoId: string): Promise<{ scanId: string; jobId: string | null }> {
    const repoRow = await this.repos.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');

    const ref: RepoRef = { owner: repoRow.owner, name: repoRow.name };
    const files = await this.sample(repoId, ref);
    if (files.length === 0) {
      throw new ValidationError(
        'Nothing to sample — the repository has not been cloned and indexed yet. Open it once so repo-intel can index it, then re-run the scan.',
      );
    }

    const scan = await this.repo.insertScan(workspaceId, repoId, null);

    let jobId: string | null = null;
    try {
      const job = await this.jobs.enqueue(workspaceId, CONVENTIONS_EXTRACT_JOB_KIND, {
        scanId: scan.id,
        repoId,
        workspaceId,
      });
      jobId = job.id;
    } catch (err) {
      // No handler registered / enqueue failed — degrade the scan row instead
      // of leaving it stuck at 'running' forever.
      await this.repo.finishScan(scan.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Failed to schedule the scan',
      });
    }
    return { scanId: scan.id, jobId };
  }

  /** Registered once at plugin load (routes.ts), mirrors repo-intel's pattern. */
  registerExtractJobHandler(): void {
    this.jobs.register(CONVENTIONS_EXTRACT_JOB_KIND, async (payload) => {
      const { scanId, repoId, workspaceId } = payload as {
        scanId: string;
        repoId: string;
        workspaceId: string;
      };
      // Never throw out of here: a thrown error hands JobRunner's retry loop a
      // *paid* model call to re-run up to twice more. Every failure path below
      // resolves by writing `status: 'failed'` and returning normally.
      await this.runExtraction(workspaceId, repoId, scanId).catch(async (err) => {
        await this.repo
          .finishScan(scanId, { status: 'failed', error: err instanceof Error ? err.message : String(err) })
          .catch(() => {});
      });
    });
  }

  /**
   * Build a skill draft from candidates. Persists NOTHING — the client edits
   * the draft and POSTs it to `/skills`, the same preview-then-confirm flow
   * skill import uses. `ids` omitted means "every accepted candidate".
   */
  async skillDraft(workspaceId: string, repoId: string, ids?: string[]): Promise<ConventionSkillDraft> {
    const repoRow = await this.repos.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');

    const rows = ids?.length ? await this.repo.listByIds(workspaceId, ids) : await this.repo.listAccepted(workspaceId, repoId);
    const accepted = rows.filter((r) => r.status === 'accepted');
    if (accepted.length === 0) {
      throw new ValidationError('Accept at least one convention before creating a skill');
    }
    return buildSkillDraft(repoRow.fullName, accepted);
  }

  // ===========================================================================
  // The pipeline
  // ===========================================================================

  private async runExtraction(workspaceId: string, repoId: string, scanId: string): Promise<void> {
    const repoRow = await this.repos.getById(workspaceId, repoId);
    if (!repoRow) {
      await this.repo.finishScan(scanId, { status: 'failed', error: 'Repository not found' });
      return;
    }
    const ref: RepoRef = { owner: repoRow.owner, name: repoRow.name };

    const files = await this.sample(repoId, ref);
    if (files.length === 0) {
      await this.repo.finishScan(scanId, {
        status: 'failed',
        error: 'Nothing to sample — clone and index the repository first.',
      });
      return;
    }
    const byPath = new Map(files.map((f) => [f.path, f]));
    const sampledPaths = files.map((f) => f.path);
    const rendered = renderSamples(files, MAX_SAMPLE_CHARS);

    // Lever A — deterministic config rules, zero model cost.
    const configCandidates = deriveConfigRules(files);

    // What the model should NOT bother re-discovering: this scan's config
    // rules, plus rule text mined out of existing `type: 'convention'` skills.
    const workspaceSkills = await this.skills.listByWorkspace(workspaceId);
    const skillMinedRules = workspaceSkills
      .filter((s) => s.type === 'convention')
      .flatMap((s) => extractRuleLinesFromSkillBody(s.body));
    const alreadyCovered = [...new Set([...configCandidates.map((c) => c.rule), ...skillMinedRules])].slice(0, 30);

    const choice = await this.modelFor(workspaceId);
    const llm = await this.llmFor(choice.provider);
    const result = await llm.completeStructured({
      model: choice.model,
      schema: ExtractionSchema,
      // Matches the fixture key `MockLLMOptions.structuredBySchema` documents
      // for this feature, so a test can target this call by name.
      schemaName: 'ConventionExtraction',
      messages: [
        { role: 'system', content: buildSystemPrompt(alreadyCovered) },
        {
          role: 'user',
          content: wrapUntrusted('repo-sample', buildUserPrompt(repoRow.fullName, rendered, sampledPaths)),
        },
      ],
      temperature: EXTRACT_TEMPERATURE,
      maxTokens: EXTRACT_MAX_TOKENS,
      timeoutMs: EXTRACT_TIMEOUT_MS,
    });

    const proposed = result.data.candidates;
    const verified: VerifiedCandidate[] = [];
    let droppedUngrounded = 0;
    for (const raw of proposed) {
      const check = verifyCandidate(byPath, raw);
      if (check.ok) verified.push(check.candidate);
      else droppedUngrounded += 1;
    }

    // Lever B — frequency grounding: a repo-wide occurrence count REPLACES the
    // model's self-reported confidence. Below MIN_SUPPORT_FILES, the "pattern"
    // is a coincidence, not a convention — dropped, not just down-scored.
    let droppedUnsupported = 0;
    const grounded: VerifiedCandidate[] = [];
    for (const c of verified) {
      const pattern = buildProbePattern(c.probe, c.evidenceSnippet);
      const supportCount = await withTimeout(this.codeIndex.grep(ref, pattern), PROBE_GREP_TIMEOUT_MS)
        .then((matches) => new Set(matches.map((m) => m.path)).size)
        .catch(() => 0); // degrade to "unsupported" rather than fail the whole scan
      const confidence = confidenceFromSupport(supportCount);
      if (confidence === null) {
        droppedUnsupported += 1;
        continue;
      }
      grounded.push({ ...c, confidence, supportCount, probe: pattern });
    }

    // Strongest-first so dedupe/quota keep the best survivor on a tie. Config
    // rows sit at confidence 1.0, so a stated fact always wins over a guess.
    const ranked = [...configCandidates, ...grounded].sort((a, b) => b.confidence - a.confidence);

    // Lever C, step 1 — never re-propose a rule the user already ruled on
    // (D5) or that this same scan's own candidates repeat.
    const existing = await this.repo.listForRepo(workspaceId, repoId);
    const decidedKeys = existing.filter((r) => r.status !== 'pending').map((r) => ruleKey(r.rule));
    const { kept: afterDecided, dropped: droppedDuplicate } = dedupeCandidates(ranked, decidedKeys);

    // Lever C, step 2 — never re-propose a rule already folded into a skill.
    const skillKeys = skillMinedRules.map(ruleKey);
    const { kept: afterSkills, dropped: droppedExistingSkill } = dedupeCandidates(afterDecided, skillKeys);

    // Lever C, step 3 — cap how many of the MODEL's guesses one category may
    // contribute. Config facts are never capped; they are always shown.
    const configFinal = afterSkills.filter((c) => c.origin === 'config');
    const modelFinal = afterSkills.filter((c) => c.origin === 'model');
    const { kept: modelCapped, dropped: droppedCategoryCap } = capPerCategory(modelFinal);

    const finalCandidates = [...configFinal, ...modelCapped];
    await this.repo.replacePending(workspaceId, repoId, finalCandidates, scanId);

    await this.repo.finishScan(scanId, {
      status: 'done',
      sampledFiles: sampledPaths,
      proposed: proposed.length,
      fromConfig: configCandidates.length,
      droppedUngrounded,
      droppedUnsupported,
      droppedDuplicate,
      droppedExistingSkill,
      droppedCategoryCap,
      model: result.model,
      costUsd: result.costUsd,
    });
  }

  /**
   * Stage 1 — pick and read the sample, entirely in code.
   *
   * Configs come first (they state conventions outright and are cheap), then
   * repo-intel's top-ranked source files, which already exclude tests, configs
   * and migrations. A file that cannot be read is skipped rather than fatal:
   * `CONFIG_SAMPLE_PATHS` is a wish-list, and most repos have only a few of them.
   */
  private async sample(repoId: string, ref: RepoRef): Promise<SampledFile[]> {
    const codePaths = await this.repoIntel.getConventionSamples(repoId, TOP_CODE_SAMPLES).catch(() => [] as string[]);
    const paths = [...CONFIG_SAMPLE_PATHS, ...codePaths];

    const files: SampledFile[] = [];
    const seen = new Set<string>();
    for (const path of paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      let raw: string;
      try {
        raw = await this.git.readFile(ref, path);
      } catch {
        continue; // not in this repo (config wish-list) or unreadable — skip
      }
      if (!raw.trim()) continue;
      files.push(toSampledFile(path, raw));
    }
    return files;
  }
}
