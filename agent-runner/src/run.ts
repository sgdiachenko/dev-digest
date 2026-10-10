import path from 'node:path';
import { CI_LIMITS, CiTrigger } from '@devdigest/shared';
import type { AgentManifest, CiResultArtifact, Finding, GitHubReviewPayload, LLMProvider, UnifiedDiff, Verdict } from '@devdigest/shared';
import { reviewPullRequest, toReviewPayload, gateTriggered, countBlockers } from '@devdigest/reviewer-core';
import { listManifests, loadManifest, type ManifestFile } from './manifest.js';
import { readSkills } from './skills.js';
import { readMemory } from './memory.js';
import { resolvePrContext, type PrContext } from './context.js';
import { parseUnifiedDiff, stripIgnoredFiles } from './diff.js';
import { fetchPrDiff, postGithubReview, postPrComment, type FetchLike } from './github.js';
import { buildResultArtifact, writeResultArtifact, type AgentTrace } from './artifact.js';
import { DiffUnavailableError } from './errors.js';
import { makeRedactor, redactDeep, type Redactor } from './redact.js';

/**
 * `runAll` — the runner's orchestrator. Every `.devdigest/agents/*.yaml` is one
 * agent, run in isolation (AC-160): a failure of one never stops the others,
 * every agent writes its own `devdigest-result.json` on every path that ends
 * after start (AC-63), and the process exit code is the MAX over the agents
 * (AC-121, AC-142). Gate order per agent follows the spec: manifest, fork,
 * trigger, key, skills, memory, diff — none of them makes an LLM call or posts.
 *
 * The review itself is reviewer-core's `reviewPullRequest` (assemblePrompt /
 * wrapUntrusted / mandatory grounding inside); the verdict, exit code and
 * counts come from the DETERMINISTIC gate on grounded findings, never from the
 * model's self-reported verdict.
 */

export type PostAs = AgentManifest['post_as'];

/** Hard bound on the raw diff body, before .devdigest/** and the workflow are stripped. */
export const RAW_DIFF_CEILING_BYTES = 8 * 1024 * 1024;

export interface RunDeps {
  env: Record<string, string | undefined>;
  /** Injected LLM provider — `OpenRouterProvider` in production, a stub in tests. */
  llm: LLMProvider;
  /** Checked-in `.devdigest/` directory (agents/, skills/, memory.jsonl). */
  devdigestDir: string;
  /** Directory the per-agent `<slug>/devdigest-result.json` files go under. */
  resultDir: string;
  /** Build identifier of the running bundle (see `computeRunnerBuild`). */
  runnerBuild: string;
  fetchImpl?: FetchLike;
  now?: () => number;
  /** Log sink; every line is secret-redacted before it reaches it. */
  log?: (line: string) => void;
}

export interface AgentResult {
  slug: string;
  status: CiResultArtifact['status'];
  reason: string | null;
  exitCode: 0 | 1;
  artifact: CiResultArtifact;
  posted: PostAs | null;
  payload?: GitHubReviewPayload;
  blockers: number;
  gateTriggered: boolean;
  grounding: string | null;
}

export interface RunResult {
  exitCode: 0 | 1;
  agents: AgentResult[];
}

interface Outcome {
  status: CiResultArtifact['status'];
  reason: string | null;
  exitCode: 0 | 1;
  verdict?: Verdict | null;
  findings?: Finding[];
  costUsd?: number | null;
  posted?: PostAs | null;
  payload?: GitHubReviewPayload;
  blockers?: number;
  gateTriggered?: boolean;
  grounding?: string | null;
}

const end = (status: Outcome['status'], reason: string | null, exitCode: 0 | 1): Outcome => ({
  status,
  reason,
  exitCode,
});

const VERDICT: Record<GitHubReviewPayload['event'], Verdict> = {
  APPROVE: 'approve',
  COMMENT: 'comment',
  REQUEST_CHANGES: 'request_changes',
};

const TRIGGERS = new Set<string>(CiTrigger.options);

/** Keep the artifact directory inside `resultDir` whatever the file name was. */
function dirName(slug: string): string {
  const safe = slug.replace(/[^A-Za-z0-9._-]/g, '_');
  return safe.startsWith('.') ? `_${safe}` : safe;
}

type DiffState = { ok: true; diff: UnifiedDiff } | { ok: false };

export async function runAll(deps: RunDeps): Promise<RunResult> {
  const env = deps.env;
  const redact: Redactor = makeRedactor([env.OPENROUTER_API_KEY, env.GITHUB_TOKEN]);
  const emit = deps.log ?? ((line: string) => console.log(line));
  const log = (line: string) => emit(redact(line));
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const githubToken = env.GITHUB_TOKEN ?? '';

  let manifests: ManifestFile[];
  try {
    manifests = listManifests(deps.devdigestDir);
  } catch (err) {
    log(`[agent-runner] FAILED: ${(err as Error).message}`);
    return { exitCode: 1, agents: [] };
  }
  if (manifests.length === 0) {
    log(`[agent-runner] FAILED: no agent manifests (*.yaml) under ${path.join(deps.devdigestDir, 'agents')}`);
    return { exitCode: 1, agents: [] };
  }

  const context = resolvePrContext(env);

  // The diff is fetched at most once per run, only when an agent reaches it.
  let diffPromise: Promise<DiffState> | null = null;
  const getDiff = (ctx: PrContext): Promise<DiffState> => {
    // The 2 MB limit applies to the diff that is reviewed, after .devdigest/** and
    // the workflow are stripped; the raw body is bounded only by a hard ceiling.
    diffPromise ??= fetchPrDiff(ctx, githubToken, RAW_DIFF_CEILING_BYTES, fetchImpl).then(
      (raw): DiffState => {
        const reviewed = stripIgnoredFiles(raw);
        if (Buffer.byteLength(reviewed) > CI_LIMITS.RAW_DIFF_MAX_BYTES) {
          throw new DiffUnavailableError(`diff is larger than ${CI_LIMITS.RAW_DIFF_MAX_BYTES} bytes`);
        }
        return { ok: true, diff: parseUnifiedDiff(reviewed) };
      },
    ).catch(
      (err): DiffState => {
        log(`[agent-runner] diff unavailable: ${err instanceof DiffUnavailableError ? err.message : 'unexpected error'}`);
        return { ok: false };
      },
    );
    return diffPromise;
  };

  const agents: AgentResult[] = [];
  for (const file of manifests) {
    const trace: AgentTrace = {
      agent: file.slug,
      agentVersion: null,
      ciFailOn: null,
      model: null,
      skills: [],
      memorySha256: null,
      manifestSha256: null,
    };
    const start = now();

    const execute = async (): Promise<Outcome> => {
      const loaded = loadManifest(file.path);
      if (!loaded.ok) {
        log(`[agent-runner] ${file.slug}: ${loaded.message}`);
        return end('failed', 'manifest_invalid', 1);
      }
      const { manifest } = loaded;
      trace.agent = manifest.name;
      trace.agentVersion = manifest.agent_version;
      trace.ciFailOn = manifest.ci_fail_on;
      trace.model = manifest.model;
      trace.manifestSha256 = loaded.sha256;

      if (!context.ok) {
        log(`[agent-runner] ${file.slug}: ${context.message}`);
        return end('failed', 'event_invalid', 1);
      }
      const ctx = context.ctx;

      if (ctx.isFork) return end('skipped', 'fork_pr', 0);
      if (!TRIGGERS.has(ctx.action) || !manifest.triggers.includes(ctx.action as CiTrigger)) {
        return end('skipped', 'trigger_not_selected', 0);
      }
      if (!env.OPENROUTER_API_KEY) {
        log(`[agent-runner] ${file.slug}: OPENROUTER_API_KEY is empty - add it as a repository secret named OPENROUTER_API_KEY`);
        return end('failed', 'missing_openrouter_key', 1);
      }
      // Without a token the review cannot be published; stop before spending an LLM call.
      if (manifest.post_as !== 'none' && !githubToken) {
        log(`[agent-runner] ${file.slug}: GITHUB_TOKEN is empty - the workflow must pass it to publish the review`);
        return end('failed', 'post_failed', 1);
      }

      const skills = readSkills(deps.devdigestDir, manifest.skills);
      trace.skills = skills.entries;
      if (!skills.ok) {
        log(`[agent-runner] ${file.slug}: skill file for slug '${skills.missing}' is missing`);
        return end('failed', 'skill_missing', 1);
      }

      const memory = readMemory(deps.devdigestDir);
      trace.memorySha256 = memory.sha256;
      if (!memory.ok) {
        log(`[agent-runner] ${file.slug}: ${memory.message}`);
        return end('failed', 'memory_invalid', 1);
      }

      const diffState = await getDiff(ctx);
      if (!diffState.ok) return end('failed', 'diff_unavailable', 1);
      const diff = diffState.diff;
      if (diff.files.length === 0) return end('no_findings', 'empty_diff', 0);

      // Title, body and branch names are author-controlled: they go ONLY into
      // the untrusted pr-description block (AC-66, AC-166), never a trusted line.
      const prDescription = [
        `Title: ${ctx.title}`,
        `Base branch: ${ctx.baseRef}`,
        `Head branch: ${ctx.headRef}`,
        '',
        ctx.body,
      ].join('\n');

      let outcome;
      try {
        outcome = await reviewPullRequest({
          systemPrompt: manifest.system_prompt,
          model: manifest.model,
          diff,
          llm: deps.llm,
          strategy: manifest.strategy,
          skills: skills.blocks,
          memory: memory.items,
          prDescription,
          task: 'Review this pull request.',
        });
      } catch (err) {
        return end('failed', `llm_error: ${err instanceof Error ? err.message : String(err)}`, 1);
      }

      const findings = outcome.review.findings; // already grounded
      const failOn = manifest.ci_fail_on;
      const payload = redactDeep(
        toReviewPayload(outcome.review, { failOn, diff, title: manifest.name }),
        redact,
      );
      const triggered = gateTriggered(findings, failOn);

      let reason: string | null = null;
      try {
        if (manifest.post_as === 'github_review') {
          await postGithubReview(ctx, githubToken, payload, fetchImpl);
        } else if (manifest.post_as === 'pr_comment') {
          await postPrComment(ctx, githubToken, payload.body, fetchImpl);
        }
      } catch (err) {
        reason = 'post_failed';
        log(`[agent-runner] ${file.slug}: ${err instanceof Error ? err.message : 'posting failed'}`);
      }

      return {
        status: findings.length === 0 ? 'no_findings' : 'succeeded',
        reason,
        exitCode: triggered ? 1 : 0,
        verdict: VERDICT[payload.event],
        findings,
        costUsd: outcome.costUsd,
        posted: reason === null ? manifest.post_as : null,
        payload,
        blockers: countBlockers(findings, failOn),
        gateTriggered: triggered,
        grounding: outcome.grounding,
      };
    };

    let outcome: Outcome;
    try {
      outcome = await execute();
    } catch (err) {
      outcome = end('failed', `internal_error: ${err instanceof Error ? err.message : String(err)}`, 1);
    }

    const artifact = buildResultArtifact({
      status: outcome.status,
      verdict: outcome.verdict ?? null,
      findings: outcome.findings ?? [],
      costUsd: outcome.costUsd ?? null,
      durationMs: now() - start,
      reason: outcome.reason,
      trace,
      runnerBuild: deps.runnerBuild,
      redact,
    });
    let exitCode = outcome.exitCode;
    try {
      writeResultArtifact(deps.resultDir, dirName(file.slug), artifact);
    } catch (err) {
      log(`[agent-runner] ${file.slug}: cannot write the result artifact: ${(err as Error).message}`);
      exitCode = 1;
    }

    // NFR-10: grounding summary, counts, status, reason, build id, exit code only.
    log(
      `[agent-runner] agent=${file.slug} status=${artifact.status} reason=${artifact.reason ?? '-'} ` +
        `findings=${artifact.findings_count} critical=${artifact.critical} warning=${artifact.warning} ` +
        `suggestion=${artifact.suggestion} grounding=${outcome.grounding ?? '-'} ` +
        `build=${deps.runnerBuild} exit=${exitCode}`,
    );

    agents.push({
      slug: file.slug,
      status: artifact.status,
      reason: artifact.reason,
      exitCode,
      artifact,
      posted: outcome.posted ?? null,
      ...(outcome.payload ? { payload: outcome.payload } : {}),
      blockers: outcome.blockers ?? 0,
      gateTriggered: outcome.gateTriggered ?? false,
      grounding: outcome.grounding ?? null,
    });
  }

  return { exitCode: agents.some((a) => a.exitCode === 1) ? 1 : 0, agents };
}
