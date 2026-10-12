/**
 * T2 + T3 — Export to CI install flow (S2.2, S2.4) over mock ports: no DB, no network.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CI_LIMITS, CI_PATHS, CiExportInput } from '@devdigest/shared';
import { MockGitHubCiClient, MockRunnerBundleSource } from '../src/adapters/mocks.js';
import { FsRunnerBundleSource } from '../src/adapters/runner-bundle/fs.js';
import { AppError } from '../src/platform/errors.js';
import { CiService } from '../src/modules/ci/service.js';
import { gitBlobSha } from '../src/modules/ci/helpers.js';
import type { CiGitHubResolver } from '../src/modules/ci/types.js';
import {
  CapturingLogger,
  FakeAgents,
  FakeCiStore,
  ScriptedGitHub,
  WS,
  httpError,
  makeAgent,
  makeInstallation,
} from './helpers/ci-fakes.js';

const PR_URL = 'https://github.com/acme/api/pull/7';

function setup(opts: { ci?: MockGitHubCiClient; agent?: Parameters<typeof makeAgent>[0]; runner?: MockRunnerBundleSource } = {}) {
  const store = new FakeCiStore();
  const gh = new ScriptedGitHub();
  const ci = opts.ci ?? new MockGitHubCiClient();
  const log = new CapturingLogger();
  const runner = opts.runner ?? new MockRunnerBundleSource();
  let resolved = 0;
  const resolver: CiGitHubResolver = async () => {
    resolved += 1;
    return { github: gh, ci };
  };
  const agents = new FakeAgents([makeAgent(opts.agent)]);
  const service = new CiService(store, agents, runner, resolver, log);
  return { store, gh, ci, log, runner, service, resolved: () => resolved };
}

const input = (over: Partial<Parameters<typeof CiExportInput.parse>[0]> = {}) =>
  CiExportInput.parse({ repo: 'acme/api', action: 'open_pr', ...over });

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected rejection');
};

describe('action files (AC-37)', () => {
  it('returns the bundle with no GitHub call, no token lookup and nothing stored', async () => {
    const s = setup();
    const out = await s.service.exportCi(WS, 'agent-1', input({ action: 'files' }));
    expect(out.installation).toBeNull();
    expect(out.pr_url).toBeNull();
    expect(out.pr_reused).toBe(false);
    expect(out.files.map((f) => f.path)).toContain(CI_PATHS.WORKFLOW);
    expect(s.resolved()).toBe(0);
    expect(s.ci.calls).toEqual([]);
    expect(s.gh.committed).toEqual([]);
    expect(s.store.upserts).toBe(0);
  });

  it('answers 503 runner_bundle_unavailable when a runner file is missing and a preview still touches nothing (AC-149)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'runner-'));
    try {
      writeFileSync(join(dir, 'index.js'), '// only one file');
      const s = setup({ runner: new FsRunnerBundleSource(dir) as unknown as MockRunnerBundleSource });
      const err = await code(s.service.exportCi(WS, 'agent-1', input({ action: 'files' })));
      expect(err.code).toBe('runner_bundle_unavailable');
      expect(err.statusCode).toBe(503);
      expect(s.ci.calls).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('T2 — runner bundle missing on install (AC-149, AC-150, AC-183)', () => {
  it('503s with no GitHub call, no commit and no installation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'runner-'));
    try {
      writeFileSync(join(dir, '300.index.js'), '// only the chunk');
      const s = setup({ runner: new FsRunnerBundleSource(dir) as unknown as MockRunnerBundleSource });
      const err = await code(s.service.exportCi(WS, 'agent-1', input()));
      expect(err.code).toBe('runner_bundle_unavailable');
      expect(err.statusCode).toBe(503);
      expect(s.ci.calls).toEqual([]);
      expect(s.gh.committed).toEqual([]);
      expect(s.gh.openedPrs).toEqual([]);
      expect(s.store.upserts).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runner package.json missing (AC-149)', () => {
  it('503s when only package.json is absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'runner-'));
    try {
      writeFileSync(join(dir, 'index.js'), '// index');
      writeFileSync(join(dir, '300.index.js'), '// chunk');
      const s = setup({ runner: new FsRunnerBundleSource(dir) as unknown as MockRunnerBundleSource });
      const err = await code(s.service.exportCi(WS, 'agent-1', input({ action: 'files' })));
      expect(err.code).toBe('runner_bundle_unavailable');
      expect(err.statusCode).toBe(503);
      expect(s.ci.calls).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('request checks, in order, before any GitHub write', () => {
  it('no token: github_token_missing 400 and no GitHub call (AC-29)', async () => {
    const s = setup();
    const noToken: CiGitHubResolver = async () => {
      throw new AppError('github_token_missing', 'A GitHub token is required.', 400);
    };
    const service = new CiService(s.store, new FakeAgents(), s.runner, noToken, s.log);
    const err = await code(service.exportCi(WS, 'agent-1', input()));
    expect(err.code).toBe('github_token_missing');
    expect(err.statusCode).toBe(400);
    expect(s.runner.reads).toBe(0);
    expect(s.ci.calls).toEqual([]);
  });

  it.each(['circle', 'jenkins', 'cli'] as const)('target %s is a 422 (AC-34)', async (target) => {
    const s = setup();
    const err = await code(s.service.exportCi(WS, 'agent-1', input({ target })));
    expect(err.statusCode).toBe(422);
    expect(s.ci.calls).toEqual([]);
  });

  it('rejects an empty or whitespace workflow replacement with 422 (AC-36)', async () => {
    const s = setup();
    for (const workflow_contents of ['', '   \n']) {
      const err = await code(s.service.exportCi(WS, 'agent-1', input({ workflow_contents })));
      expect(err.statusCode).toBe(422);
    }
    expect(s.ci.calls).toEqual([]);
  });

  it('rejects a workflow replacement above 64 KB measured in bytes (AC-36)', async () => {
    const s = setup();
    // 40k two-byte characters = 80 KB in UTF-8 but only 40k characters.
    const workflow_contents = 'é'.repeat(CI_LIMITS.WORKFLOW_EDIT_MAX_BYTES / 2 + 1);
    expect(workflow_contents.length).toBeLessThan(CI_LIMITS.WORKFLOW_EDIT_MAX_BYTES);
    const err = await code(s.service.exportCi(WS, 'agent-1', input({ workflow_contents })));
    expect(err.statusCode).toBe(422);
  });

  it('rejects a non-openrouter agent with 422 before any GitHub call', async () => {
    const s = setup({ agent: { provider: 'openai' } });
    const err = await code(s.service.exportCi(WS, 'agent-1', input()));
    expect(err.statusCode).toBe(422);
    expect(s.ci.calls).toEqual([]);
  });

  it('rejects a malformed repo with 422 before it can reach a GitHub path', async () => {
    const s = setup();
    const err = await code(s.service.exportCi(WS, 'agent-1', input({ repo: '../etc/passwd' })));
    expect(err.statusCode).toBe(422);
    expect(s.ci.calls).toEqual([]);
  });

  it('404s an unknown agent', async () => {
    const s = setup();
    const err = await code(s.service.exportCi(WS, 'nope', input()));
    expect(err.statusCode).toBe(404);
  });
});

describe('GitHub state conflicts (AC-27, AC-122)', () => {
  it('branch without an open PR: 409 branch_exists_without_pr and nothing written', async () => {
    const s = setup({ ci: new MockGitHubCiClient({ branchExists: true }) });
    const err = await code(s.service.exportCi(WS, 'agent-1', input()));
    expect(err.code).toBe('branch_exists_without_pr');
    expect(err.statusCode).toBe(409);
    expect(s.gh.commitCalls).toBe(0);
    expect(s.store.upserts).toBe(0);
  });

  it('another agent with the same slug in the repo: 409 agent_slug_conflict and nothing written', async () => {
    const s = setup();
    s.store.installs = [makeInstallation({ id: 'i-other', agentId: 'agent-2', agentSlug: 'security-reviewer' })];
    const err = await code(s.service.exportCi(WS, 'agent-1', input()));
    expect(err.code).toBe('agent_slug_conflict');
    expect(err.statusCode).toBe(409);
    expect(s.gh.commitCalls).toBe(0);
    expect(s.store.upserts).toBe(0);
  });
});

describe('new branch (AC-23, AC-24, AC-28, AC-179)', () => {
  it('commits the whole bundle once to devdigest/ci, opens the PR and stores the snapshot', async () => {
    const s = setup();
    s.store.skills = [{ name: 'Auth rules', source: 'manual', body: 'check auth' }];
    const out = await s.service.exportCi(WS, 'agent-1', input({ post_as: 'pr_comment', triggers: ['opened'] }));

    expect(s.gh.committed).toHaveLength(1);
    const commit = s.gh.committed[0]!;
    expect(commit.branch).toBe('devdigest/ci');
    expect(commit.base).toBe('main');
    expect(commit.files.map((f) => f.path)).toEqual(out.files.map((f) => f.path));

    expect(s.gh.openedPrs).toHaveLength(1);
    expect(s.gh.openedPrs[0]).toMatchObject({ title: 'Add DevDigest CI review', head: 'devdigest/ci', base: 'main' });
    expect(out.pr_url).toBe('https://github.com/mock/mock/pull/1');
    expect(out.pr_number).toBe(1);
    expect(out.pr_reused).toBe(false);

    expect(s.store.installs).toHaveLength(1);
    expect(s.store.installs[0]).toMatchObject({
      agentId: 'agent-1',
      repo: 'acme/api',
      githubRepoId: 1001,
      agentSlug: 'security-reviewer',
      agentVersion: 3,
      ciFailOn: 'critical',
      postAs: 'pr_comment',
      triggers: ['opened'],
      workflowPath: '.github/workflows/devdigest-review.yml',
      prNumber: 1,
      exportedModel: 'anthropic/claude-sonnet-4',
    });
    expect(s.store.installs[0]!.exportedSkills).toEqual([
      { slug: 'auth-rules', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);
    expect(out.installation).toMatchObject({ agent_version: 3, post_as: 'pr_comment', outdated: false });
  });

  it('accepts only the workflow replacement from the client (AC-130)', async () => {
    const s = setup();
    const out = await s.service.exportCi(WS, 'agent-1', input({ workflow_contents: 'name: mine\n' }));
    expect(out.files.find((f) => f.path === CI_PATHS.WORKFLOW)!.contents).toBe('name: mine\n');
    const committedWf = s.gh.committed[0]!.files.find((f) => f.path === CI_PATHS.WORKFLOW)!;
    expect(committedWf.contents).toBe('name: mine\n');
    expect(s.gh.committed[0]!.files.find((f) => f.path.endsWith('.yaml'))!.contents).not.toContain('mine');
  });

  it('is not retried: a failing commit is attempted once', async () => {
    const s = setup();
    s.gh.commitError = httpError(502);
    const err = await code(s.service.exportCi(WS, 'agent-1', input()));
    expect(err.code).toBe('github_unavailable');
    expect(s.gh.commitCalls).toBe(1);
    expect(s.store.upserts).toBe(0);
  });
});

describe('existing branch with an open PR (AC-25, AC-26, AC-119, AC-125)', () => {
  it('identical files: no commit, PR reused, installation still recorded', async () => {
    const probe = setup();
    const preview = await probe.service.exportCi(WS, 'agent-1', input({ action: 'files' }));
    const branchBlobs = Object.fromEntries(preview.files.map((f) => [f.path, gitBlobSha(f.contents)]));

    const s = setup({ ci: new MockGitHubCiClient({ branchExists: true, branchBlobs }) });
    s.gh.openPrUrl = PR_URL;
    const out = await s.service.exportCi(WS, 'agent-1', input());

    expect(s.gh.commitCalls).toBe(0);
    expect(out.pr_reused).toBe(true);
    expect(out.pr_url).toBe(PR_URL);
    expect(out.pr_number).toBe(7);
    expect(s.store.upserts).toBe(1);
  });

  it('adds one commit with only the changed paths and unions the other agents\' triggers', async () => {
    const s = setup({ ci: new MockGitHubCiClient({ branchExists: true, branchBlobs: {} }) });
    s.gh.openPrUrl = PR_URL;
    s.store.installs = [
      makeInstallation({ id: 'i-b', agentId: 'agent-2', agentSlug: 'perf-reviewer', triggers: ['reopened'] }),
    ];
    s.store.agentNames['agent-2'] = 'Perf Reviewer';
    const out = await s.service.exportCi(WS, 'agent-1', input({ triggers: ['opened'] }));

    expect(s.gh.commitCalls).toBe(1);
    expect(s.gh.openedPrs).toEqual([]);
    const paths = s.gh.committed[0]!.files.map((f) => f.path);
    expect(paths).not.toContain('.devdigest/agents/perf-reviewer.yaml');
    expect(paths.every((p) => out.files.some((f) => f.path === p))).toBe(true);

    const wf = s.gh.committed[0]!.files.find((f) => f.path === CI_PATHS.WORKFLOW)!.contents;
    expect(wf).toContain('types: [opened, reopened]');
    expect(wf).toContain('devdigest-result-perf-reviewer');
    expect(wf).toContain('devdigest-result-security-reviewer');
    expect(out.pr_reused).toBe(true);
  });

  it('commits only the paths whose blob differs', async () => {
    const probe = setup();
    const preview = await probe.service.exportCi(WS, 'agent-1', input({ action: 'files' }));
    const blobs = Object.fromEntries(preview.files.map((f) => [f.path, gitBlobSha(f.contents)]));
    blobs['.devdigest/memory.jsonl'] = 'stale-sha';

    const s = setup({ ci: new MockGitHubCiClient({ branchExists: true, branchBlobs: blobs }) });
    s.gh.openPrUrl = PR_URL;
    await s.service.exportCi(WS, 'agent-1', input());
    expect(s.gh.committed[0]!.files.map((f) => f.path)).toEqual(['.devdigest/memory.jsonl']);
  });
});

describe('GitHub failures map to stable codes and record nothing (AC-30–33, AC-129)', () => {
  it('404 on the repo: repo_not_accessible', async () => {
    const s = setup({ ci: new MockGitHubCiClient({ error: httpError(404) }) });
    const err = await code(s.service.exportCi(WS, 'agent-1', input()));
    expect(err.code).toBe('repo_not_accessible');
    expect(err.statusCode).toBe(404);
    expect(s.store.upserts).toBe(0);
  });

  it('403 on the write: github_scope_missing naming both token kinds', async () => {
    const s = setup();
    s.gh.commitError = httpError(403, 'Resource not accessible by personal access token');
    const err = await code(s.service.exportCi(WS, 'agent-1', input()));
    expect(err.code).toBe('github_scope_missing');
    expect(err.statusCode).toBe(403);
    expect(err.message).toContain('`workflow`');
    expect(err.message).toContain('Workflows: write');
    expect(s.store.upserts).toBe(0);
  });

  it('403 with a rate-limit message and 429 are github_unavailable 503', async () => {
    for (const e of [httpError(403, 'API rate limit exceeded'), httpError(429)]) {
      const s = setup({ ci: new MockGitHubCiClient({ error: e }) });
      const err = await code(s.service.exportCi(WS, 'agent-1', input()));
      expect(err.code).toBe('github_unavailable');
      expect(err.statusCode).toBe(503);
    }
  });

  it('PR creation failing after the branch exists names devdigest/ci and records nothing', async () => {
    const s = setup();
    s.gh.openError = httpError(500);
    const err = await code(s.service.exportCi(WS, 'agent-1', input()));
    expect(err.code).toBe('github_unavailable');
    expect(err.message).toContain('devdigest/ci');
    expect(s.gh.commitCalls).toBe(1);
    expect(s.store.upserts).toBe(0);
  });

  it('a non-HTTP error is not disguised as a GitHub error', async () => {
    const s = setup();
    s.gh.commitError = new TypeError('bug');
    const err = await s.service.exportCi(WS, 'agent-1', input()).catch((e) => e);
    expect(err).toBeInstanceOf(TypeError);
  });
});

describe('logging (NFR-9)', () => {
  it('logs one line per install with the required fields and no secret or URL', async () => {
    const s = setup();
    await s.service.exportCi(WS, 'agent-1', input());
    expect(s.log.lines).toHaveLength(1);
    expect(s.log.lines[0]!.obj).toEqual({
      agent_id: 'agent-1',
      repo: 'acme/api',
      outcome: 'opened',
      error_code: null,
      runs_stored: 0,
    });

    const failing = setup({ ci: new MockGitHubCiClient({ error: httpError(404, 'https://api.github.com/secret-path') }) });
    await code(failing.service.exportCi(WS, 'agent-1', input()));
    expect(failing.log.lines[0]!.obj).toMatchObject({ outcome: 'error', error_code: 'repo_not_accessible' });
    expect(JSON.stringify(failing.log.lines)).not.toContain('secret-path');
  });
});

describe('listInstallations (AC-75, AC-76, AC-69)', () => {
  it('computes outdated, pending_update and latest_run', async () => {
    const s = setup({ agent: { version: 5, ciFailOn: 'warning' } });
    s.store.installs = [makeInstallation({ agentVersion: 3, ciFailOn: 'critical' })];
    s.store.runs = [
      {
        id: 'r1',
        installationId: 'inst-1',
        repo: 'acme/api',
        prNumber: 7,
        headSha: 'a'.repeat(40),
        workflowRunId: 9,
        runAttempt: 1,
        ranAt: '2026-10-08T00:00:00.000Z',
        durationS: 12,
        status: 'succeeded',
        verdict: 'comment',
        findingsCount: 1,
        critical: 0,
        warning: 1,
        suggestion: 0,
        costUsd: 0.01,
        agentVersion: 3,
        githubUrl: 'https://github.com/acme/api/actions/runs/9',
        unavailableReason: null,
        model: 'anthropic/claude-sonnet-4',
        ciFailOn: 'critical',
        skills: [],
        memorySha256: null,
        manifestSha256: 'b'.repeat(64),
        runnerBuild: 'c'.repeat(64),
      },
    ];
    const [row] = await s.service.listInstallations(WS, 'agent-1');
    expect(row).toMatchObject({ outdated: true, pending_update: true, repo: 'acme/api' });
    expect(row!.latest_run).toMatchObject({ id: 'r1', status: 'succeeded', agent: 'Security Reviewer' });
  });

  it('is not outdated or pending when the agent matches the snapshot, and has no latest run', async () => {
    const s = setup();
    s.store.installs = [makeInstallation()];
    const [row] = await s.service.listInstallations(WS, 'agent-1');
    expect(row).toMatchObject({ outdated: false, pending_update: false, latest_run: null });
  });
});
