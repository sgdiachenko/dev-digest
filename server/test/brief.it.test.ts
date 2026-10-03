/**
 * PR Brief — HTTP + real Postgres (Testcontainers), with a fake LLM provider and a stub
 * repo-intel facade. NOT run by the implementer (needs Docker); gated like the other
 * `*.it.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from 'node:http';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { LLMProvider, PrBriefRecord, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const HEAD = 'abc1234';
const PATCH = '@@ -1,2 +1,3 @@\n a\n+b\n c\n';

const OUTPUT = {
  summary: 'Adds things.',
  risks: [{ kind: 'licensing', title: 'Risky', explanation: 'Because', severity: 'high', file_refs: ['src/a.ts:2'] }],
  review_focus: [{ file: 'src/a.ts', line: 99, reason: 'start here' }],
};

/** A non-degraded blast with endpoints/crons that the brief must NOT keep. */
const intel = (): RepoIntel =>
  ({
    getBlastRadius: async () => ({
      changedSymbols: [{ file: 'src/a.ts', name: 'fn', kind: 'function' }],
      callers: [{ file: 'src/c.ts', symbol: 'caller', viaSymbol: 'fn', line: 4, rank: 1 }],
      impactedEndpoints: ['GET /x'],
      factsByFile: { 'src/c.ts': { endpoints: ['GET /x'], crons: ['nightly'] } },
    }),
  }) as unknown as RepoIntel;

function mockLlm(structured: unknown = OUTPUT) {
  return new MockLLMProvider('openai', { structuredBySchema: { PrBriefOutput: structured } });
}

d('PR Brief routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function insertPr(opts: { files?: boolean; filesCount?: number } = {}) {
    const name = `brief-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Add things',
        author: 'octocat',
        branch: 'feat/x',
        base: 'main',
        headSha: HEAD,
        body: 'Does stuff',
        filesCount: opts.filesCount ?? 2,
        status: 'open',
      })
      .returning();
    if (opts.files !== false) {
      await pg.handle.db.insert(t.prFiles).values([
        { prId: pr!.id, path: 'src/a.ts', additions: 1, deletions: 0, patch: PATCH },
        { prId: pr!.id, path: 'src/nopatch.ts', additions: 3, deletions: 0, patch: null },
      ]);
    }
    return pr!;
  }

  const appWith = (llm: LLMProvider, repoIntel: RepoIntel = intel()) =>
    buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel, llm: { openai: llm } } });
  const stored = (prId: string) => pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
  const calls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured');

  it('GET null -> POST 200 -> GET returns the same record; exactly one LLM call with the default model', async () => {
    const pr = await insertPr();
    const llm = mockLlm();
    const app = await appWith(llm);

    const empty = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toBeNull();

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(post.statusCode).toBe(200);
    const rec = post.json() as PrBriefRecord;
    expect(rec).toMatchObject({ pr_id: pr.id, head_sha: HEAD, stale: false, provider: 'openai', model: 'gpt-4.1' });
    expect(calls(llm)).toHaveLength(1);
    expect((calls(llm)[0]!.req as StructuredRequest<unknown>).model).toBe('gpt-4.1');
    expect((calls(llm)[0]!.req as StructuredRequest<unknown>).maxRetries).toBe(0);

    // unknown kind -> other; line outside the ranges snapped; unverifiable-free file
    expect(rec.risks.risks[0]!.kind).toBe('other');
    expect(rec.review_focus).toEqual([{ file: 'src/a.ts', line: 2, reason: 'start here', line_verified: true }]);

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(get.json()).toEqual(rec);
    expect(calls(llm)).toHaveLength(1); // GET made no LLM call
    await app.close();
  });

  it('emits exactly one structured completion record for a DB-backed generation', async () => {
    const pr = await insertPr();
    const app = await appWith(mockLlm());
    const logs: unknown[] = [];
    const logger = { info: (record: unknown) => logs.push(record), warn: (record: unknown) => logs.push(record) };
    await app.container.briefService().generate(workspaceId, pr.id, logger);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: 'brief.completed', outcome: 'ok', provider: 'openai', durationMs: expect.any(Number) });
    expect(await stored(pr.id)).toHaveLength(1);
    await app.close();
  });

  it('a model override from settings is used', async () => {
    const pr = await insertPr();
    const llm = mockLlm();
    const app = await appWith(llm);
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'openai', model: 'gpt-4.1-mini' } } },
    });
    expect(put.statusCode).toBe(200);
    const rec = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).json() as PrBriefRecord;
    expect(rec.model).toBe('gpt-4.1-mini');
    expect((calls(llm)[0]!.req as StructuredRequest<unknown>).model).toBe('gpt-4.1-mini');
    await app.close();
    // the override is workspace-wide and the DB is shared by every test below: clear it
    await pg.handle.db.delete(t.settings);
  });

  it('404 for an unknown PR, 422 for a malformed id', async () => {
    const app = await appWith(mockLlm());
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/pulls/${missing}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${missing}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/brief' })).statusCode).toBe(422);
    await app.close();
  });

  it('409 no_diff_data without an LLM call', async () => {
    const pr = await insertPr({ files: false, filesCount: 0 });
    const llm = mockLlm();
    const app = await appWith(llm);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details).toEqual({ reason: 'no_diff_data' });
    expect(calls(llm)).toHaveLength(0);
    await app.close();
  });

  it('409 missing_key with the provider, no LLM call', async () => {
    const pr = await insertPr();
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { repoIntel: intel(), secrets: { get: async () => undefined } },
    });
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details).toEqual({ reason: 'missing_key', provider: 'openai' });
    expect(await stored(pr.id)).toHaveLength(0);
    await app.close();
  });

  it('the 11th POST within a minute is 429', async () => {
    const pr = await insertPr();
    const app = await appWith(mockLlm());
    for (let i = 0; i < 10; i++) {
      expect((await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode).toBe(429);
    await app.close();
  });

  it('parallel POSTs for one PR make one LLM call and share the outcome', async () => {
    const pr = await insertPr();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = mockLlm();
    const slow = {
      id: 'openai',
      calls: inner.calls,
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        await gate;
        return inner.completeStructured(req);
      },
    } as unknown as LLMProvider;
    const app = await appWith(slow);
    const a = app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const b = app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    await new Promise((r) => setTimeout(r, 100));
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.statusCode).toBe(200);
    expect(rb.json()).toEqual(ra.json());
    expect(calls(inner)).toHaveLength(1);
    await app.close();
  });

  it('invalid_output and llm_error leave the previous brief unchanged', async () => {
    const pr = await insertPr();
    const ok = await appWith(mockLlm());
    await ok.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const before = await stored(pr.id);
    await ok.close();

    const bad = new MockLLMProvider('openai', { structuredBySchema: { PrBriefOutput: { nope: true } } });
    const failing = await appWith(bad);
    const res = await failing.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.details.reason).toBe('invalid_output');
    await failing.close();

    const throwing = await appWith({
      id: 'openai',
      completeStructured: async () => {
        throw Object.assign(new Error('quota exceeded'), { status: 429 });
      },
    } as unknown as LLMProvider);
    const res2 = await throwing.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res2.statusCode).toBe(502);
    expect(res2.json().error.details.reason).toBe('llm_error');
    await throwing.close();

    expect(await stored(pr.id)).toEqual(before);
  });

  it('stale: a new head SHA reads as stale on GET', async () => {
    const pr = await insertPr();
    const app = await appWith(mockLlm());
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'def5678' }).where(eq(t.pullRequests.id, pr.id));
    const rec = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json() as PrBriefRecord;
    expect(rec.stale).toBe(true);
    expect(rec.head_sha).toBe(HEAD);
    await app.close();
  });

  it('a corrupted or older-schema stored document reads as null', async () => {
    const pr = await insertPr();
    const app = await appWith(mockLlm());
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { schema_version: 0, garbage: true } });
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json()).toBeNull();
    await app.close();
  });

  it('truncated diff_stats and the not-cloned specs reason are listed; specs_used is empty', async () => {
    const pr = await insertPr({ filesCount: 9 });
    const app = await appWith(mockLlm());
    const rec = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).json() as PrBriefRecord;
    expect(rec.missing_inputs).toContainEqual({ input: 'diff_stats', reason: 'truncated' });
    expect(rec.missing_inputs).toContainEqual({ input: 'intent', reason: 'not_derived' });
    expect(rec.missing_inputs.some((m) => m.input === 'specs')).toBe(true);
    expect(rec.specs_used).toEqual([]);
    await app.close();
  });

  it('the stored blast is the projection: no endpoints or crons, only the sent callers', async () => {
    const pr = await insertPr();
    const app = await appWith(mockLlm());
    const rec = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).json() as PrBriefRecord;
    expect(rec.blast).not.toBeNull();
    expect(rec.blast!.changed_symbols).toEqual([{ name: 'fn', file: 'src/a.ts', kind: 'function' }]);
    for (const group of rec.blast!.downstream) {
      expect(group.endpoints_affected).toEqual([]);
      expect(group.crons_affected).toEqual([]);
      for (const caller of group.callers) {
        expect(caller.endpoints_affected).toEqual([]);
        expect(caller.crons_affected).toEqual([]);
      }
    }
    const [row] = await stored(pr.id);
    expect(JSON.stringify(row!.json)).not.toContain('nightly');
    await app.close();
  });

  it.each([
    ['unavailable', async () => { throw new Error('index unavailable'); }],
    ['timeout', () => new Promise<never>(() => {})],
    ['index_failed', async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [], factsByFile: {}, degraded: true, reason: 'index_failed' })],
  ] as const)('POST stores a brief with blast missing when repo intel is %s', async (reason, getBlastRadius) => {
    const pr = await insertPr();
    const llm = mockLlm();
    const app = await appWith(llm, { getBlastRadius } as unknown as RepoIntel);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    const rec = res.json() as PrBriefRecord;
    expect(rec.blast).toBeNull();
    expect(rec.missing_inputs).toContainEqual({ input: 'blast', reason });
    expect(calls(llm)).toHaveLength(1);
    await app.close();
  }, 20_000);

  it('a real HTTP disconnect does not stop the generation: the brief is still stored', async () => {
    const pr = await insertPr();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started!: () => void;
    const startedP = new Promise<void>((r) => (started = r));
    const inner = mockLlm();
    const slow = {
      id: 'openai',
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        started();
        await gate;
        return inner.completeStructured(req);
      },
    } as unknown as LLMProvider;
    const app: FastifyInstance = await appWith(slow);
    try {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const addr = app.server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const req = request({ host: '127.0.0.1', port, path: `/pulls/${pr.id}/brief`, method: 'POST' });
      req.on('error', () => {});
      req.end();
      await startedP;
      req.destroy(); // the socket is closed while the model call is still running
      await new Promise((r) => setTimeout(r, 50));
      release();

      let rows: unknown[] = [];
      for (let i = 0; i < 100 && rows.length === 0; i++) {
        rows = await stored(pr.id);
        if (rows.length === 0) await new Promise((r) => setTimeout(r, 50));
      }
      expect(rows).toHaveLength(1);
      const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
      expect((get.json() as PrBriefRecord).summary).toBe('Adds things.');
    } finally {
      await app.close();
    }
  });
});
