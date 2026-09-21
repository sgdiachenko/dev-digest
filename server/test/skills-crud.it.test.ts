import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {

  console.warn('[skills-crud] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD + versioning — the read/write path over `skills`/`skill_versions`
 * the Skill Editor's Config/Versions tabs use. Mirrors
 * `agents-versions.it.test.ts`'s shape for the version-bump semantics.
 */
d('Skills CRUD + versions', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  // Skill names are unique per workspace (skills_ws_name_uq); this fixture is
  // shared across every `it` in this file, so each test builds its own name.
  let skillSeq = 0;
  const RUBRIC_BODY = '# Rubric\nCheck correctness.';
  function createBody() {
    return { name: `pr-quality-rubric-${skillSeq++}`, type: 'rubric' as const, body: RUBRIC_BODY };
  }

  it('creates a skill with v1 recorded in skill_versions', async () => {
    const app = await makeApp();
    const body = createBody();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: body });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: body.name,
      type: 'rubric',
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ skill_id: skill.id, version: 1, body: RUBRIC_BODY, note: 'Initial version' });
    await app.close();
  });

  it('a body edit bumps the version and snapshots the note; list is newest-first', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: createBody() })).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# Rubric\nCheck correctness AND tests.', note: 'Added tests dimension' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({ version: 2, note: 'Added tests dimension' });
    expect(versions[0].body).toContain('AND tests');
    expect(versions[1].note).toBe('Initial version');
    await app.close();
  });

  it('renaming or toggling enabled alone does NOT bump the version', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: createBody() })).json().id as string;

    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { name: `renamed-${skillSeq++}` } });
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { enabled: false } });

    const skill = (await app.inject({ method: 'GET', url: `/skills/${skillId}` })).json();
    expect(skill.version).toBe(1);
    expect(skill.enabled).toBe(false);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('a rewritten body is a NO-OP if it matches the current body byte-for-byte', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: createBody() })).json().id as string;
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: RUBRIC_BODY } });
    const skill = (await app.inject({ method: 'GET', url: `/skills/${skillId}` })).json();
    expect(skill.version).toBe(1);
    await app.close();
  });

  it('restore appends a NEW version rather than rewinding history', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: createBody() })).json().id as string;
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: 'v2 body', note: 'v2' } });
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: 'v3 body', note: 'v3' } });

    const restored = await app.inject({ method: 'POST', url: `/skills/${skillId}/restore`, payload: { version: 1 } });
    expect(restored.statusCode).toBe(200);
    const skill = restored.json();
    expect(skill.version).toBe(4);
    expect(skill.body).toBe(RUBRIC_BODY);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions).toHaveLength(4);
    expect(versions[0]).toMatchObject({ version: 4, body: RUBRIC_BODY, note: 'Restored v1' });
    // v1's own snapshot is untouched — restoring never rewrites history.
    expect(versions[3]).toMatchObject({ version: 1, body: RUBRIC_BODY });
    await app.close();
  });

  it('GET /skills/:id/versions/:version fetches one snapshot for the Diff modal', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: createBody() })).json().id as string;
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: 'v2 body' } });

    const v1 = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/1` });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, body: RUBRIC_BODY });
    await app.close();
  });

  it('rejects a duplicate name in the same workspace with 409', async () => {
    const app = await makeApp();
    const body = createBody();
    await app.inject({ method: 'POST', url: '/skills', payload: body });
    const dup = await app.inject({ method: 'POST', url: '/skills', payload: body });
    expect(dup.statusCode).toBe(409);
    await app.close();
  });

  it('deletes a skill; its versions cascade', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: createBody() })).json().id as string;
    const del = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
    expect(del.json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}` })).statusCode).toBe(404);
    await app.close();
  });

  it('404s for an unknown skill and an unknown version', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: createBody() })).json().id as string;
    const ghost = '00000000-0000-0000-0000-000000000000';

    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}/versions` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/99` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `/skills/${skillId}/restore`, payload: { version: 99 } }))
        .statusCode,
    ).toBe(404);
    await app.close();
  });

  it('skills are workspace-scoped: another tenant cannot read or update them', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: `other-skills-${skillSeq++}` }).returning();
    const [foreign] = await db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: `foreign-skill-${skillSeq++}`,
        description: '',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();

    expect((await app.inject({ method: 'GET', url: `/skills/${foreign!.id}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${foreign!.id}`, payload: { name: 'stolen' } })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('the import endpoint parses a markdown upload without persisting anything', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;

    const content = Buffer.from('# no-then-chains\nAlways use async/await.').toString('base64');
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'rule.md', content_b64: content },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'no-then-chains', source: 'imported_url', skipped_files: [] });

    const after = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    expect(after).toBe(before);
    await app.close();
  });

  it('rejects an import with no markdown content (422)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'notes.txt', content_b64: Buffer.from('hi').toString('base64') },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
