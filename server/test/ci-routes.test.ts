/**
 * T5 — Export to CI routes via app.inject(), DB-free: every collaborator is a
 * container override. Response shapes parse with the shared contracts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  CiExport,
  CiInstallation,
  CiRefreshResponse,
  CiRun,
  CI_LIMITS,
} from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import {
  MockAuthProvider,
  MockGitHubCiClient,
  MockRunnerBundleSource,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import { FakeAgents, FakeCiStore, ScriptedGitHub, makeAgent, makeInstallation } from './helpers/ci-fakes.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const AGENT = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'fake-token-for-log-redaction-test';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function boot(opts: { store?: FakeCiStore; withToken?: boolean; ci?: MockGitHubCiClient } = {}) {
  const store = opts.store ?? new FakeCiStore();
  const ci = opts.ci ?? new MockGitHubCiClient();
  const withToken = opts.withToken ?? true;
  app = await buildApp({
    config,
    overrides: {
      auth: new MockAuthProvider(),
      secrets: new MockSecretsProvider(withToken ? { GITHUB_TOKEN: TOKEN } : {}),
      ...(withToken ? { github: new ScriptedGitHub(), githubCi: ci } : {}),
      runnerBundle: new MockRunnerBundleSource(),
      ciStore: store,
      ciAgents: new FakeAgents([makeAgent({ id: AGENT })]),
    },
  });
  return { app, store, ci };
}

describe('POST /agents/:id/export-ci', () => {
  it('preview (files): 200 CiExport with no installation and nothing stored', async () => {
    const { app, store } = await boot();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT}/export-ci`,
      payload: { repo: 'acme/api', action: 'files' },
    });
    expect(res.statusCode).toBe(200);
    const body = CiExport.parse(res.json());
    expect(body.installation).toBeNull();
    expect(body.files.find((f) => f.editable)?.path).toBe('.github/workflows/devdigest-review.yml');
    expect(store.upserts).toBe(0);
  });

  it('install: 200 with the installation, PR and snapshot', async () => {
    const { app, store } = await boot();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT}/export-ci`,
      payload: { repo: 'acme/api', action: 'open_pr', triggers: ['opened'] },
    });
    expect(res.statusCode).toBe(200);
    const body = CiExport.parse(res.json());
    expect(body.pr_url).toContain('/pull/');
    expect(body.installation).toMatchObject({ repo: 'acme/api', triggers: ['opened'], exported_model: 'anthropic/claude-sonnet-4' });
    expect(store.installs).toHaveLength(1);
  });

  it('maps errors to the envelope and never echoes the token', async () => {
    const { app } = await boot({ withToken: false });
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT}/export-ci`,
      payload: { repo: 'acme/api', action: 'open_pr' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('github_token_missing');
    expect(res.body).not.toContain(TOKEN);
  });

  it('validates input at the edge: bad triggers, empty triggers and a non-uuid id are 422', async () => {
    const { app } = await boot();
    for (const [url, payload] of [
      [`/agents/${AGENT}/export-ci`, { repo: 'acme/api', triggers: ['pushed'] }],
      [`/agents/${AGENT}/export-ci`, { repo: 'acme/api', triggers: [] }],
      [`/agents/${AGENT}/export-ci`, { repo: '' }],
      ['/agents/not-a-uuid/export-ci', { repo: 'acme/api' }],
    ] as const) {
      const res = await app.inject({ method: 'POST', url, payload });
      expect(res.statusCode).toBe(422);
    }
  });

  it('a non-gha target is a 422 from the service', async () => {
    const { app } = await boot();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT}/export-ci`,
      payload: { repo: 'acme/api', target: 'jenkins', action: 'files' },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('GET /agents/:id/ci-installations', () => {
  it('returns installations with the computed flags', async () => {
    const store = new FakeCiStore();
    store.installs = [makeInstallation({ agentId: AGENT, agentVersion: 1, ciFailOn: 'warning' })];
    const { app } = await boot({ store });
    const res = await app.inject({ method: 'GET', url: `/agents/${AGENT}/ci-installations` });
    expect(res.statusCode).toBe(200);
    const rows = CiInstallation.array().parse(res.json());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outdated: true, pending_update: true, latest_run: null });
  });

  it('is an empty list for an agent with no installation, 404 for an unknown agent', async () => {
    const { app } = await boot();
    const ok = await app.inject({ method: 'GET', url: `/agents/${AGENT}/ci-installations` });
    expect(ok.json()).toEqual([]);
    const missing = await app.inject({
      method: 'GET',
      url: '/agents/22222222-2222-4222-8222-222222222222/ci-installations',
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('GET /ci-runs', () => {
  it('returns CiRun[] and honours the limit, capped at 100', async () => {
    const store = new FakeCiStore();
    store.installs = [makeInstallation({ agentId: AGENT })];
    const seen: number[] = [];
    store.listRuns = async (_w, limit) => {
      seen.push(limit);
      return [];
    };
    const { app } = await boot({ store });
    expect((await app.inject({ method: 'GET', url: '/ci-runs' })).json()).toEqual([]);
    await app.inject({ method: 'GET', url: '/ci-runs?limit=5' });
    const tooBig = await app.inject({ method: 'GET', url: '/ci-runs?limit=101' });
    expect(tooBig.statusCode).toBe(422);
    expect(seen).toEqual([CI_LIMITS.RUNS_PAGE_MAX, 5]);
  });

  it('serialises stored runs with the trace fields and the flag', async () => {
    const store = new FakeCiStore();
    store.installs = [makeInstallation({ agentId: AGENT })];
    await store.upsertRun({
      installationId: 'inst-1',
      repo: 'acme/api',
      githubRepoId: 1001,
      workflowRunId: 9,
      runAttempt: 1,
      headSha: 'a'.repeat(40),
      headRepo: 'acme/api',
      prNumber: null,
      ranAt: new Date('2026-10-08T00:00:00Z'),
      durationS: 3,
      status: 'succeeded',
      githubUrl: 'https://github.com/acme/api/actions/runs/9',
      unavailableReason: null,
      artifact: {
        kind: 'set',
        data: {
          verdict: 'comment',
          findingsCount: 1,
          critical: 0,
          warning: 1,
          suggestion: 0,
          costUsd: 0.01,
          agentVersion: 3,
          ciFailOn: 'critical',
          model: 'other/model',
          skills: [],
          memorySha256: null,
          manifestSha256: 'b'.repeat(64),
          runnerBuild: 'c'.repeat(64),
        },
      },
    });
    const { app } = await boot({ store });
    const rows = CiRun.array().parse((await app.inject({ method: 'GET', url: '/ci-runs' })).json());
    expect(rows[0]).toMatchObject({
      pr_number: null,
      source: 'gha',
      model: 'other/model',
      manifest_sha256: 'b'.repeat(64),
      differs_from_export: true,
    });
  });
});

describe('POST /ci-runs/refresh', () => {
  it('returns one result per installation', async () => {
    const store = new FakeCiStore();
    store.installs = [makeInstallation({ agentId: AGENT })];
    const { app } = await boot({ store });
    const res = await app.inject({ method: 'POST', url: '/ci-runs/refresh' });
    expect(res.statusCode).toBe(200);
    expect(CiRefreshResponse.parse(res.json()).results).toEqual([
      { installation_id: 'inst-1', repo: 'acme/api', stored: 0, error_code: null },
    ]);
  });

  it('answers github_token_missing 400 without a token', async () => {
    const { app } = await boot({ withToken: false });
    const res = await app.inject({ method: 'POST', url: '/ci-runs/refresh' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('github_token_missing');
  });
});
