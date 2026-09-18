import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { CodeIndex, CodeMatch, CodeReference, CodeSymbol, LLMProvider, RepoRef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const SAMPLED_SOURCE = [
  'export function reallyDistinctiveHelperName(): number {',
  '  return 1;',
  '}',
].join('\n');

/** Always reports 3 distinct occurrences repo-wide, regardless of the probe —
 *  enough to clear MIN_SUPPORT_FILES and land in the 0.70 confidence band. */
class FixedCodeIndex implements CodeIndex {
  async grep(_repo: RepoRef, _pattern: string): Promise<CodeMatch[]> {
    return [
      { path: 'a.ts', line: 1, text: 'x' },
      { path: 'b.ts', line: 1, text: 'x' },
      { path: 'c.ts', line: 1, text: 'x' },
    ];
  }
  async symbols(): Promise<CodeSymbol[]> {
    return [];
  }
  async references(): Promise<CodeReference[]> {
    return [];
  }
}

/** Simulates the model call itself failing (timeout, provider error, …). */
class ThrowingLLMProvider implements LLMProvider {
  readonly id = 'openai' as const;
  calls = 0;
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('not used');
  }
  async completeStructured(): Promise<never> {
    this.calls += 1;
    throw new Error('boom - simulated model failure');
  }
  async embed() {
    return [];
  }
}

/** A minimal `RepoIntel` double: only `getConventionSamples` is exercised by
 *  this feature; every other method throws if the test ever calls it. */
function makeRepoIntel(samplesByRepo: Record<string, string[]>): RepoIntel {
  const notImplemented = () => {
    throw new Error('not implemented in this test double');
  };
  return {
    indexRepo: notImplemented,
    refreshIndex: notImplemented,
    getIndexState: notImplemented,
    getBlastRadius: notImplemented,
    getRepoMap: notImplemented,
    getFileRank: notImplemented,
    getSymbolsInFiles: notImplemented,
    getCallerSignatures: notImplemented,
    getUnresolvedReferences: notImplemented,
    getConventionSamples: async (repoId: string) => samplesByRepo[repoId] ?? [],
    getTopFilesByRank: notImplemented,
    getCriticalPaths: notImplemented,
  } as unknown as RepoIntel;
}

function validCandidateFixture(overrides: Record<string, unknown> = {}) {
  return {
    rule: 'Exported helpers use a descriptive, unabbreviated name.',
    rationale: 'Keeps call sites self-documenting.',
    evidence_path: 'src/index.ts',
    evidence_line: 1,
    evidence_snippet: 'export function reallyDistinctiveHelperName(): number {',
    probe: 'reallyDistinctiveHelperName',
    category: 'naming',
    occurrences: 3,
    confidence: 0.6,
    ...overrides,
  };
}

const INVENTED_CANDIDATE = {
  rule: 'A totally invented rule that was never in the sample.',
  rationale: 'n/a',
  evidence_path: 'src/does-not-exist.ts',
  evidence_line: 1,
  evidence_snippet: 'this code was never sampled',
  probe: 'doesNotExist',
  category: 'general',
  occurrences: 1,
  confidence: 0.9,
};

d('Conventions Extractor — scan, evidence gate, triage, skill draft', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** A fresh repo row per test (unique full_name — see server/INSIGHTS.md on
   *  shared-fixture unique-index collisions), with a sampled source file. */
  async function makeRepo() {
    const name = `conv-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  function makeApp(opts: { llmFixture?: unknown; llm?: LLMProvider; samplesByRepo?: Record<string, string[]> } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: { 'src/index.ts': SAMPLED_SOURCE } }),
        github: new MockGitHubClient(),
        codeIndex: new FixedCodeIndex(),
        repoIntel: makeRepoIntel(opts.samplesByRepo ?? {}),
        ...(opts.llm
          ? { llm: { openai: opts.llm } }
          : {
              llm: {
                openai: new (class {
                  readonly id = 'openai' as const;
                  async listModels() {
                    return [];
                  }
                  async complete(): Promise<never> {
                    throw new Error('not used');
                  }
                  async completeStructured() {
                    return {
                      data: { candidates: opts.llmFixture ?? [validCandidateFixture(), INVENTED_CANDIDATE] },
                      model: 'gpt-5.4',
                      tokensIn: 100,
                      tokensOut: 50,
                      costUsd: 0.001,
                      raw: '{}',
                      attempts: 1,
                    };
                  }
                  async embed() {
                    return [];
                  }
                })() as unknown as LLMProvider,
              },
            }),
      },
    });
  }

  async function runScanAndWait(app: Awaited<ReturnType<typeof makeApp>>, repoId: string) {
    const started = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(started.statusCode).toBe(202);
    await app.container.jobs.onIdle();
    return started.json();
  }

  it('a scan drops the invented candidate via the evidence gate and reports the counters', async () => {
    const repo = await makeRepo();
    const app = await makeApp({ samplesByRepo: { [repo.id]: ['src/index.ts'] } });

    await runScanAndWait(app, repo.id);

    const scan = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions/scan` })).json();
    expect(scan.status).toBe('done');
    expect(scan.proposed).toBe(2);
    expect(scan.dropped_ungrounded).toBe(1);

    const candidates = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].rule).toContain('descriptive, unabbreviated name');
    expect(candidates[0].evidence_path).toBe('src/index.ts');
    expect(candidates[0].status).toBe('pending');
    expect(candidates[0].origin).toBe('model');
    // Lever B replaced the model's self-reported 0.6 with a real support count (3 files → 0.70 band).
    expect(candidates[0].confidence).toBe(0.7);
    expect(candidates[0].support_count).toBe(3);
    await app.close();
  });

  it('422s before any model call when the repo has nothing to sample', async () => {
    const repo = await makeRepo();
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(), // no files at all — every path reads back empty
        github: new MockGitHubClient(),
        codeIndex: new FixedCodeIndex(),
        repoIntel: makeRepoIntel({}), // getConventionSamples → [] for this repo
      },
    });
    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('re-scan preserves an accepted decision and never re-proposes it as a new pending row', async () => {
    const repo = await makeRepo();
    const app = await makeApp({ samplesByRepo: { [repo.id]: ['src/index.ts'] } });

    await runScanAndWait(app, repo.id);
    const [first] = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    const accept = await app.inject({ method: 'PATCH', url: `/conventions/${first.id}`, payload: { status: 'accepted' } });
    expect(accept.statusCode).toBe(200);

    // Re-scan: the same fixture proposes the identical rule again.
    await runScanAndWait(app, repo.id);

    const scan = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions/scan` })).json();
    expect(scan.dropped_duplicate).toBeGreaterThanOrEqual(1);

    const candidates = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    expect(candidates).toHaveLength(1); // still just the one, now accepted — no duplicate pending row
    expect(candidates[0].id).toBe(first.id);
    expect(candidates[0].status).toBe('accepted');
    await app.close();
  });

  it('a rejected candidate stays rejected and is excluded from the skill draft', async () => {
    const repo = await makeRepo();
    const app = await makeApp({ samplesByRepo: { [repo.id]: ['src/index.ts'] } });
    await runScanAndWait(app, repo.id);
    const [candidate] = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();

    await app.inject({ method: 'PATCH', url: `/conventions/${candidate.id}`, payload: { status: 'rejected' } });

    const draftAttempt = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill`, payload: {} });
    expect(draftAttempt.statusCode).toBe(422); // nothing accepted

    const stillThere = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    expect(stillThere[0].status).toBe('rejected');
    await app.close();
  });

  it('edit → accept → skill draft reflects the edit, and POST /skills persists it', async () => {
    const repo = await makeRepo();
    const app = await makeApp({ samplesByRepo: { [repo.id]: ['src/index.ts'] } });
    await runScanAndWait(app, repo.id);
    const [candidate] = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();

    await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidate.id}`,
      payload: { rule: 'Edited rule text.', status: 'accepted' },
    });

    const draft = (
      await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill`, payload: {} })
    ).json();
    expect(draft.name).toBe('repo-conventions');
    expect(draft.body).toContain('Edited rule text.');
    expect(draft.evidence_files).toContain('src/index.ts');

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: draft.name, description: draft.description, type: draft.type, body: draft.body, source: 'extracted', evidence_files: draft.evidence_files },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'repo-conventions', type: 'convention', source: 'extracted' });
    expect(created.json().evidence_files).toContain('src/index.ts');
    await app.close();
  });

  it('"Deselect all" moves every accepted row back to pending', async () => {
    const repo = await makeRepo();
    const app = await makeApp({ samplesByRepo: { [repo.id]: ['src/index.ts'] } });
    await runScanAndWait(app, repo.id);
    const [candidate] = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    await app.inject({ method: 'PATCH', url: `/conventions/${candidate.id}`, payload: { status: 'accepted' } });

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/deselect-all` });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].status).toBe('pending');
    await app.close();
  });

  it('a model-call failure marks the scan failed and does not retry the paid call', async () => {
    const repo = await makeRepo();
    const throwing = new ThrowingLLMProvider();
    const app = await makeApp({ samplesByRepo: { [repo.id]: ['src/index.ts'] }, llm: throwing });

    await runScanAndWait(app, repo.id);

    const scan = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions/scan` })).json();
    expect(scan.status).toBe('failed');
    expect(scan.error).toContain('boom');
    expect(throwing.calls).toBe(1); // JobRunner's retry loop never saw a rejection
    await app.close();
  });
});
