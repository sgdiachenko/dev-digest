/**
 * T4 — Refresh / ingest (S2.6) over mock ports: status mapping, run filters,
 * every unavailable reason, trace validation, kept numbers, differs_from_export.
 */
import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { CI_LIMITS } from '@devdigest/shared';
import type { CiResultArtifact, CiWorkflowRun, CiRunArtifact } from '@devdigest/shared';
import { MockGitHubCiClient } from '../src/adapters/mocks.js';
import { AppError } from '../src/platform/errors.js';
import { CiSyncService } from '../src/modules/ci/sync-service.js';
import type { CiGitHubResolver } from '../src/modules/ci/types.js';
import {
  CapturingLogger,
  FakeCiStore,
  ScriptedGitHub,
  WS,
  httpError,
  makeInstallation,
} from './helpers/ci-fakes.js';

const SHA = 'a'.repeat(40);
const H = (c: string) => c.repeat(64);

function run(over: Partial<CiWorkflowRun> = {}): CiWorkflowRun {
  return {
    id: 100,
    runAttempt: 1,
    headSha: SHA,
    headRepo: 'acme/api',
    repositoryId: 1001,
    path: '.github/workflows/devdigest-review.yml',
    status: 'completed',
    conclusion: 'success',
    htmlUrl: 'https://github.com/acme/api/actions/runs/100',
    runStartedAt: '2026-10-08T10:00:00Z',
    createdAt: '2026-10-08T09:59:00Z',
    updatedAt: '2026-10-08T10:01:30Z',
    pullRequests: [12],
    ...over,
  };
}

function result(over: Partial<CiResultArtifact> = {}): CiResultArtifact {
  return {
    schema_version: 1,
    status: 'succeeded',
    verdict: 'comment',
    findings_count: 3,
    critical: 1,
    warning: 1,
    suggestion: 1,
    cost_usd: 0.02,
    duration_ms: 5000,
    agent: 'Security Reviewer',
    agent_version: 3,
    ci_fail_on: 'critical',
    model: 'anthropic/claude-sonnet-4',
    skills: [{ slug: 'auth', sha256: H('1') }],
    memory_sha256: H('2'),
    manifest_sha256: H('3'),
    runner_build: H('4'),
    reason: null,
    ...over,
  };
}

const zip = (json: string, extra: Record<string, Uint8Array> = {}) =>
  zipSync({ 'devdigest-result.json': strToU8(json), ...extra });
const zipOf = (a: unknown) => zip(JSON.stringify(a));

const art = (over: Partial<CiRunArtifact> = {}): CiRunArtifact => ({
  id: 500,
  name: 'devdigest-result-security-reviewer',
  expired: false,
  sizeInBytes: 1000,
  ...over,
});

function setup(ciOpts: ConstructorParameters<typeof MockGitHubCiClient>[0] = {}, installs = [makeInstallation()]) {
  const store = new FakeCiStore();
  store.installs = installs;
  const ci = new MockGitHubCiClient(ciOpts);
  const log = new CapturingLogger();
  let resolved = 0;
  const resolver: CiGitHubResolver = async () => {
    resolved += 1;
    return { github: new ScriptedGitHub(), ci };
  };
  const service = new CiSyncService(store, resolver, log);
  return { store, ci, log, service, resolved: () => resolved };
}

const withArtifact = (a: Uint8Array | null, over: Partial<CiRunArtifact> = {}) => ({
  runs: [run()],
  artifactsByRun: { 100: [art(over)] },
  archives: { 500: a },
});

describe('status mapping (AC-86)', () => {
  it('in progress / queued → running, without touching artifacts', async () => {
    for (const status of ['in_progress', 'queued']) {
      const s = setup({ runs: [run({ status, conclusion: null })] });
      await s.service.refresh(WS);
      expect(s.store.runs[0]).toMatchObject({ status: 'running', durationS: null, unavailableReason: null });
      expect(s.ci.calls).not.toContain('listRunArtifacts');
    }
  });

  it('a successful run with zero findings → no_findings; with findings → succeeded', async () => {
    const zero = setup(withArtifact(zipOf(result({ status: 'no_findings', findings_count: 0, critical: 0, warning: 0, suggestion: 0 }))));
    await zero.service.refresh(WS);
    expect(zero.store.runs[0]).toMatchObject({ status: 'no_findings', findingsCount: 0 });

    const some = setup(withArtifact(zipOf(result())));
    await some.service.refresh(WS);
    expect(some.store.runs[0]).toMatchObject({ status: 'succeeded', findingsCount: 3, critical: 1, costUsd: 0.02 });
  });

  it('an artifact with status skipped → skipped', async () => {
    const s = setup(withArtifact(zipOf(result({ status: 'skipped', findings_count: 0, reason: 'fork_pr' }))));
    await s.service.refresh(WS);
    expect(s.store.runs[0]!.status).toBe('skipped');
  });

  it('cancelled → cancelled, any other conclusion → failed', async () => {
    const c = setup({ runs: [run({ conclusion: 'cancelled' })] });
    await c.service.refresh(WS);
    expect(c.store.runs[0]).toMatchObject({ status: 'cancelled', unavailableReason: 'artifact_missing' });

    const f = setup(withArtifact(zipOf(result({ status: 'failed' })), {}));
    f.ci.opts.runs = [run({ conclusion: 'failure' })];
    await f.service.refresh(WS);
    expect(f.store.runs[0]!.status).toBe('failed');
  });

  it('duration comes from the API timing, not the artifact', async () => {
    const s = setup(withArtifact(zipOf(result({ duration_ms: 1 }))));
    await s.service.refresh(WS);
    expect(s.store.runs[0]).toMatchObject({ durationS: 90, ranAt: '2026-10-08T10:00:00.000Z' });
  });
});

describe('which runs are read and stored (AC-84, AC-87, AC-88, AC-116, AC-136)', () => {
  it('ignores other workflows, other repositories, bad SHAs and runs awaiting approval', async () => {
    const s = setup({
      runs: [
        run({ id: 1, path: '.github/workflows/other.yml' }),
        run({ id: 2, repositoryId: 999 }),
        run({ id: 3, headSha: 'a'.repeat(39) }),
        run({ id: 4, headSha: 'z'.repeat(40) }),
        run({ id: 5, status: 'waiting', conclusion: null }),
        run({ id: 6, status: 'action_required', conclusion: null }),
        run({ id: 7, path: '.github/workflows/devdigest-review.yml@refs/pull/12/merge' }),
      ],
    });
    const out = await s.service.refresh(WS);
    expect(s.store.runs.map((r) => r.workflowRunId)).toEqual([7]);
    expect(out.results[0]).toMatchObject({ stored: 1, error_code: null });
  });

  it('reads at most the 20 newest runs', async () => {
    const runs = Array.from({ length: 25 }, (_, i) => run({ id: 1000 + i }));
    const s = setup({ runs });
    const out = await s.service.refresh(WS);
    expect(out.results[0]!.stored).toBe(CI_LIMITS.RUNS_PER_SYNC);
  });

  it('stores a run without run_attempt as attempt 1', async () => {
    const s = setup({ runs: [run({ runAttempt: null })] });
    await s.service.refresh(WS);
    expect(s.store.runs[0]!.runAttempt).toBe(1);
  });

  it('a repeated refresh updates the same row (idempotent)', async () => {
    const s = setup(withArtifact(zipOf(result())));
    await s.service.refresh(WS);
    await s.service.refresh(WS);
    expect(s.store.runs).toHaveLength(1);
    expect(s.store.runUpserts).toBe(2);
  });

  it('each attempt is its own row', async () => {
    const s = setup({ runs: [run({ runAttempt: 1 }), run({ runAttempt: 2 })] });
    await s.service.refresh(WS);
    expect(s.store.runs.map((r) => r.runAttempt)).toEqual([1, 2]);
  });
});

describe('PR attribution (AC-95, AC-114)', () => {
  it('takes the PR from the run, else matches head SHA + repo, else null', async () => {
    const s = setup({
      runs: [
        run({ id: 1, pullRequests: [12] }),
        run({ id: 2, pullRequests: [], headSha: 'b'.repeat(40) }),
        run({ id: 3, pullRequests: [], headSha: 'c'.repeat(40) }),
      ],
      prByHead: { ['b'.repeat(40)]: 31 },
    });
    await s.service.refresh(WS);
    expect(s.store.runs.map((r) => r.prNumber)).toEqual([12, 31, null]);
  });
});

describe('unavailable artifact reasons (AC-92, AC-113, AC-138, AC-140)', () => {
  it('no result artifact at all → artifact_missing', async () => {
    const s = setup({ runs: [run()] });
    await s.service.refresh(WS);
    expect(s.store.runs[0]).toMatchObject({ unavailableReason: 'artifact_missing', findingsCount: null });
  });

  it('listed as expired → artifact_expired, never downloaded', async () => {
    const s = setup(withArtifact(zipOf(result()), { expired: true }));
    await s.service.refresh(WS);
    expect(s.store.runs[0]!.unavailableReason).toBe('artifact_expired');
    expect(s.ci.downloads).toEqual([]);
  });

  it('download answers 410 → artifact_expired and the sync continues', async () => {
    const s = setup({ ...withArtifact(null), runs: [run({ id: 100 }), run({ id: 101 })], artifactsByRun: { 100: [art()], 101: [art({ id: 501 })] }, archives: { 500: null, 501: zipOf(result()) } });
    const out = await s.service.refresh(WS);
    expect(s.store.runs.map((r) => r.unavailableReason)).toEqual(['artifact_expired', null]);
    expect(out.results[0]!.error_code).toBeNull();
  });

  it('archive above 1 MB → artifact_too_large and not downloaded', async () => {
    const s = setup(withArtifact(zipOf(result()), { sizeInBytes: CI_LIMITS.ARTIFACT_ARCHIVE_MAX_BYTES + 1 }));
    await s.service.refresh(WS);
    expect(s.store.runs[0]!.unavailableReason).toBe('artifact_too_large');
    expect(s.ci.downloads).toEqual([]);
  });

  it('a download that outgrows the cap → artifact_too_large', async () => {
    const s = setup(withArtifact(zipOf(result())));
    s.ci.downloadArtifact = async () => {
      throw new AppError('artifact_too_large', 'too big', 413);
    };
    await s.service.refresh(WS);
    expect(s.store.runs[0]!.unavailableReason).toBe('artifact_too_large');
  });

  it('result entry declaring more than 256 KB → artifact_too_large', async () => {
    const big = zip(JSON.stringify(result()) + ' '.repeat(CI_LIMITS.RESULT_ENTRY_MAX_BYTES));
    const s = setup(withArtifact(big));
    await s.service.refresh(WS);
    expect(s.store.runs[0]).toMatchObject({ unavailableReason: 'artifact_too_large', findingsCount: null });
  });
});

describe('invalid artifacts (AC-91, AC-178)', () => {
  it.each([
    ['not JSON', zip('{nope')],
    ['not a zip', strToU8('plain text')],
    ['no result entry', zipSync({ 'other.json': strToU8('{}') })],
    ['schema mismatch', zipOf({ hello: 'world' })],
    ['63-char sha256 in a skill', zipOf(result({ skills: [{ slug: 'auth', sha256: H('1').slice(1) }] }))],
    ['63-char manifest hash', zipOf(result({ manifest_sha256: H('3').slice(1) }))],
    ['uppercase hash', zipOf(result({ memory_sha256: H('A') }))],
    ['empty model-less skill slug missing', zip(JSON.stringify({ ...result(), skills: [{ sha256: H('1') }] }))],
  ])('%s → artifact_invalid with null numbers and trace', async (_name, archive) => {
    const s = setup(withArtifact(archive));
    await s.service.refresh(WS);
    expect(s.store.runs[0]).toMatchObject({
      unavailableReason: 'artifact_invalid',
      verdict: null,
      findingsCount: null,
      costUsd: null,
      model: null,
      skills: null,
      manifestSha256: null,
      runnerBuild: null,
    });
  });

  it('reads only devdigest-result.json and ignores other entries', async () => {
    const s = setup(withArtifact(zip(JSON.stringify(result()), { 'evil.json': strToU8('{"x":1}') })));
    await s.service.refresh(WS);
    expect(s.store.runs[0]).toMatchObject({ unavailableReason: null, findingsCount: 3 });
  });

  it('stores the validated trace fields (AC-176)', async () => {
    const s = setup(withArtifact(zipOf(result())));
    await s.service.refresh(WS);
    expect(s.store.runs[0]).toMatchObject({
      model: 'anthropic/claude-sonnet-4',
      ciFailOn: 'critical',
      agentVersion: 3,
      skills: [{ slug: 'auth', sha256: H('1') }],
      memorySha256: H('2'),
      manifestSha256: H('3'),
      runnerBuild: H('4'),
    });
  });
});

describe('stored numbers (AC-93)', () => {
  it('stay when the artifact later expires, and are nulled by a later invalid one', async () => {
    const s = setup(withArtifact(zipOf(result())));
    await s.service.refresh(WS);
    expect(s.store.runs[0]!.findingsCount).toBe(3);

    s.ci.opts.artifactsByRun = { 100: [art({ expired: true })] };
    await s.service.refresh(WS);
    expect(s.store.runs[0]).toMatchObject({ unavailableReason: 'artifact_expired', findingsCount: 3, model: 'anthropic/claude-sonnet-4' });

    s.ci.opts.artifactsByRun = { 100: [art()] };
    s.ci.opts.archives = { 500: zip('{nope') };
    await s.service.refresh(WS);
    expect(s.store.runs[0]).toMatchObject({ unavailableReason: 'artifact_invalid', findingsCount: null, model: null });
  });

  it('a running row later completes in place', async () => {
    const s = setup({ runs: [run({ status: 'in_progress', conclusion: null })] });
    await s.service.refresh(WS);
    expect(s.store.runs[0]!.status).toBe('running');
    s.ci.opts = withArtifact(zipOf(result()));
    await s.service.refresh(WS);
    expect(s.store.runs).toHaveLength(1);
    expect(s.store.runs[0]).toMatchObject({ status: 'succeeded', findingsCount: 3 });
  });
});

describe('other agents\' artifacts (AC-123, AC-124)', () => {
  const others = { 100: [art({ id: 600, name: 'devdigest-result-perf-reviewer' })] };

  it('stores nothing for this installation', async () => {
    const s = setup({ runs: [run()], artifactsByRun: others });
    const out = await s.service.refresh(WS);
    expect(s.store.runs).toEqual([]);
    expect(out.results[0]!.stored).toBe(0);
  });

  it('drops a row stored earlier as running', async () => {
    const s = setup({ runs: [run({ status: 'in_progress', conclusion: null })] });
    await s.service.refresh(WS);
    expect(s.store.runs).toHaveLength(1);
    s.ci.opts = { runs: [run()], artifactsByRun: others };
    await s.service.refresh(WS);
    expect(s.store.runs).toEqual([]);
    expect(s.store.deletedRunning).toHaveLength(1);
  });
});

describe('failures are per installation (AC-96, AC-98, AC-111, AC-141)', () => {
  it('without a token nothing is read or changed', async () => {
    const s = setup({ runs: [run()] });
    const noToken: CiGitHubResolver = async () => {
      throw new AppError('github_token_missing', 'token', 400);
    };
    const svc = new CiSyncService(s.store, noToken, s.log);
    await expect(svc.refresh(WS)).rejects.toMatchObject({ code: 'github_token_missing', statusCode: 400 });
    expect(s.ci.calls).toEqual([]);
    expect(s.store.runUpserts).toBe(0);
  });

  it('403 on listing → github_scope_missing for that installation while the next one syncs', async () => {
    const store = new FakeCiStore();
    store.installs = [
      makeInstallation({ id: 'i1', repo: 'acme/locked', githubRepoId: 1 }),
      makeInstallation({ id: 'i2', agentId: 'agent-2', agentSlug: 'perf', repo: 'acme/api' }),
    ];
    const ci = new MockGitHubCiClient({ runs: [run()] });
    const original = ci.listWorkflowRuns.bind(ci);
    ci.listWorkflowRuns = async (repo, file, n) => {
      if (repo.name === 'locked') throw httpError(403, 'Resource not accessible');
      return original(repo, file, n);
    };
    const svc = new CiSyncService(store, async () => ({ github: new ScriptedGitHub(), ci }), new CapturingLogger());
    const out = await svc.refresh(WS);
    expect(out.results.map((r) => [r.repo, r.error_code, r.stored])).toEqual([
      ['acme/locked', 'github_scope_missing', 0],
      ['acme/api', null, 1],
    ]);
  });

  it.each([
    [404, 'repo_not_accessible'],
    [500, 'github_unavailable'],
    [429, 'github_unavailable'],
  ])('HTTP %i → %s', async (status, expected) => {
    const s = setup({ error: httpError(status) });
    const out = await s.service.refresh(WS);
    expect(out.results[0]).toMatchObject({ error_code: expected, stored: 0 });
  });

  it('keeps runs stored before the failure and reports the error code', async () => {
    const s = setup({ runs: [run({ id: 1 }), run({ id: 2 })] });
    let calls = 0;
    s.ci.listRunArtifacts = async () => {
      calls += 1;
      if (calls === 2) throw httpError(500);
      return [];
    };
    const out = await s.service.refresh(WS);
    expect(s.store.runs.map((r) => r.workflowRunId)).toEqual([1]);
    expect(out.results[0]).toMatchObject({ stored: 1, error_code: 'github_unavailable' });
  });

  it('keeps the artifact redirect URL out of rows, results and logs', async () => {
    const url = 'https://pipelines.actions.githubusercontent.com/secret-signature?sig=abc';
    const s = setup(withArtifact(zipOf(result())));
    s.ci.downloadArtifact = async () => {
      throw new Error(`fetch failed for ${url}`);
    };
    const out = await s.service.refresh(WS);
    expect(out.results[0]!.error_code).toBe('sync_failed');
    const everything = JSON.stringify([out, s.store.runs, s.log.lines]);
    expect(everything).not.toContain('secret-signature');
    expect(everything).not.toContain('githubusercontent');
  });

  it('logs one line per installation with the required fields', async () => {
    const s = setup(withArtifact(zipOf(result())));
    await s.service.refresh(WS);
    expect(s.log.lines).toHaveLength(1);
    expect(s.log.lines[0]!.obj).toEqual({
      agent_id: 'agent-1',
      repo: 'acme/api',
      outcome: 'ok',
      error_code: null,
      runs_stored: 1,
    });
  });

  it('skips an installation that cannot be attributed (no repo id or slug)', async () => {
    const s = setup({ runs: [run()] }, [makeInstallation({ githubRepoId: null })]);
    const out = await s.service.refresh(WS);
    expect(out.results[0]).toMatchObject({ stored: 0, error_code: null });
    expect(s.ci.calls).toEqual([]);
  });
});

describe('listRuns and differs_from_export (AC-177, AC-180–AC-182)', () => {
  async function synced(artifact: Partial<CiResultArtifact>, snapshot: Parameters<typeof makeInstallation>[0] = {}) {
    const s = setup(withArtifact(zipOf(result(artifact))), [
      makeInstallation({ exportedSkills: [{ slug: 'auth', sha256: H('1') }], ...snapshot }),
    ]);
    await s.service.refresh(WS);
    return s;
  }

  it('is false when version, model and skills match the snapshot', async () => {
    const s = await synced({});
    const [r] = await s.service.listRuns(WS, 100);
    expect(r).toMatchObject({ differs_from_export: false, agent: 'Security Reviewer', model: 'anthropic/claude-sonnet-4' });
    expect(r!.skills).toEqual([{ slug: 'auth', sha256: H('1') }]);
    expect(r!.manifest_sha256).toBe(H('3'));
    expect(r!.runner_build).toBe(H('4'));
    expect(r!.ci_fail_on).toBe('critical');
  });

  it.each([
    ['agent version', { agent_version: 2 }],
    ['model', { model: 'openai/gpt-4o' }],
    ['skill hash', { skills: [{ slug: 'auth', sha256: H('9') }] }],
    ['extra skill', { skills: [{ slug: 'auth', sha256: H('1') }, { slug: 'x', sha256: H('5') }] }],
  ])('is true when the %s differs', async (_n, artifact) => {
    const s = await synced(artifact);
    expect((await s.service.listRuns(WS, 100))[0]!.differs_from_export).toBe(true);
  });

  it('is false without a manifest hash even when the model differs (AC-182)', async () => {
    const s = await synced({ manifest_sha256: null, model: 'openai/gpt-4o' });
    expect((await s.service.listRuns(WS, 100))[0]!.differs_from_export).toBe(false);
  });

  it('compares with the CURRENT snapshot, so a later re-export flips it (AC-181)', async () => {
    const s = await synced({ model: 'openai/gpt-4o' });
    expect((await s.service.listRuns(WS, 100))[0]!.differs_from_export).toBe(true);
    s.store.installs = s.store.installs.map((i) => ({ ...i, exportedModel: 'openai/gpt-4o' }));
    expect((await s.service.listRuns(WS, 100))[0]!.differs_from_export).toBe(false);
  });

  it('shows "—" for the agent once the installation is gone (AC-100)', async () => {
    const s = await synced({});
    s.store.installs = [];
    const [r] = await s.service.listRuns(WS, 100);
    expect(r).toMatchObject({ agent: null, differs_from_export: false });
  });

  it('never returns more than 100 rows', async () => {
    const s = setup();
    let asked = 0;
    s.store.listRuns = async (_w, limit) => {
      asked = limit;
      return [];
    };
    await s.service.listRuns(WS, 5000);
    expect(asked).toBe(CI_LIMITS.RUNS_PAGE_MAX);
  });
});
