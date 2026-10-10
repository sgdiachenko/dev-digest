/**
 * T16 — CiRepository against real Postgres (testcontainers). Runs only after the
 * `ci_installations` / `ci_runs` migration has been generated (S1.5): upsert is
 * idempotent on its key, `running` rows can be dropped, stored numbers survive
 * an unavailable artifact, and lists are workspace-scoped and newest first.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { CiRepository } from '../src/modules/ci/repository.js';
import type { RunWrite, UpsertInstallation } from '../src/modules/ci/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

let pg: PgFixture;
let repo: CiRepository;
let workspaceId: string;
let otherWorkspaceId: string;
let agentId: string;
let otherAgentId: string;

const H = (c: string) => c.repeat(64);

const installation = (over: Partial<UpsertInstallation> = {}): UpsertInstallation => ({
  agentId,
  repo: 'acme/api',
  githubRepoId: 1001,
  agentSlug: 'security-reviewer',
  agentVersion: 2,
  ciFailOn: 'critical',
  postAs: 'github_review',
  triggers: ['opened', 'synchronize'],
  workflowPath: '.github/workflows/devdigest-review.yml',
  prUrl: 'https://github.com/acme/api/pull/7',
  prNumber: 7,
  exportedModel: 'anthropic/claude-sonnet-4',
  exportedSkills: [{ slug: 'auth', sha256: H('1') }],
  ...over,
});

const runWrite = (installationId: string, over: Partial<RunWrite> = {}): RunWrite => ({
  installationId,
  repo: 'acme/api',
  githubRepoId: 1001,
  workflowRunId: 100,
  runAttempt: 1,
  headSha: 'a'.repeat(40),
  headRepo: 'acme/api',
  prNumber: 12,
  ranAt: new Date('2026-10-08T10:00:00Z'),
  durationS: 30,
  status: 'succeeded',
  githubUrl: 'https://github.com/acme/api/actions/runs/100',
  unavailableReason: null,
  artifact: {
    kind: 'set',
    data: {
      verdict: 'comment',
      findingsCount: 2,
      critical: 0,
      warning: 2,
      suggestion: 0,
      costUsd: 0.02,
      agentVersion: 2,
      ciFailOn: 'critical',
      model: 'anthropic/claude-sonnet-4',
      skills: [{ slug: 'auth', sha256: H('1') }],
      memorySha256: H('2'),
      manifestSha256: H('3'),
      runnerBuild: H('4'),
    },
  },
  ...over,
});

d('CiRepository (integration)', () => {
  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    repo = new CiRepository(db);
    const [ws] = await db.insert(t.workspaces).values({ name: 'ci-ws' }).returning();
    const [ws2] = await db.insert(t.workspaces).values({ name: 'ci-other' }).returning();
    workspaceId = ws!.id;
    otherWorkspaceId = ws2!.id;
    const mk = (wid: string, name: string) =>
      db
        .insert(t.agents)
        .values({ workspaceId: wid, name, provider: 'openrouter', model: 'm', systemPrompt: 'p' })
        .returning();
    agentId = (await mk(workspaceId, 'Security Reviewer'))[0]!.id;
    otherAgentId = (await mk(otherWorkspaceId, 'Foreign'))[0]!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('upserts an installation once per (agent, repo) and refreshes the snapshot', async () => {
    const first = await repo.upsertInstallation(installation());
    const second = await repo.upsertInstallation(installation({ agentVersion: 3, exportedModel: 'other/model' }));
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ agentVersion: 3, exportedModel: 'other/model', triggers: ['opened', 'synchronize'] });
    expect(await repo.installationsForAgent(workspaceId, agentId)).toHaveLength(1);
  });

  it('scopes installations to the workspace of the owning agent', async () => {
    await repo.upsertInstallation(installation({ agentId: otherAgentId, repo: 'acme/other', agentSlug: 'foreign' }));
    expect((await repo.allInstallations(workspaceId)).map((i) => i.repo)).toEqual(['acme/api']);
    expect(await repo.installationsForRepo(workspaceId, 'acme/other')).toEqual([]);
  });

  it('upserts a run idempotently on (repo id, run id, attempt, installation)', async () => {
    const [inst] = await repo.allInstallations(workspaceId);
    await repo.upsertRun(runWrite(inst!.id));
    await repo.upsertRun(runWrite(inst!.id, { status: 'failed' }));
    const rows = await repo.listRuns(workspaceId, 100);
    expect(rows.filter((r) => r.run.workflowRunId === 100)).toHaveLength(1);
    expect(rows[0]!.run).toMatchObject({ status: 'failed', findingsCount: 2, runnerBuild: H('4') });
    expect(rows[0]!.agentName).toBe('Security Reviewer');
    expect(rows[0]!.snapshot).toMatchObject({ agentVersion: 3 });
  });

  it('keeps stored numbers when the artifact becomes unavailable, and nulls them when invalid', async () => {
    const [inst] = await repo.allInstallations(workspaceId);
    await repo.upsertRun(runWrite(inst!.id, { status: 'succeeded', unavailableReason: 'artifact_expired', artifact: { kind: 'keep' } }));
    let row = (await repo.listRuns(workspaceId, 100)).find((r) => r.run.workflowRunId === 100)!;
    expect(row.run).toMatchObject({ unavailableReason: 'artifact_expired', findingsCount: 2, model: 'anthropic/claude-sonnet-4' });

    await repo.upsertRun(runWrite(inst!.id, { unavailableReason: 'artifact_invalid', artifact: { kind: 'clear' } }));
    row = (await repo.listRuns(workspaceId, 100)).find((r) => r.run.workflowRunId === 100)!;
    expect(row.run).toMatchObject({ unavailableReason: 'artifact_invalid', findingsCount: null, model: null, skills: null });
  });

  it('keeps each attempt separate and deletes only a running row', async () => {
    const [inst] = await repo.allInstallations(workspaceId);
    await repo.upsertRun(runWrite(inst!.id, { workflowRunId: 200, status: 'running', ranAt: new Date('2026-10-09T10:00:00Z'), artifact: { kind: 'keep' } }));
    await repo.upsertRun(runWrite(inst!.id, { workflowRunId: 200, runAttempt: 2, status: 'succeeded', ranAt: new Date('2026-10-09T11:00:00Z') }));
    const key = { installationId: inst!.id, githubRepoId: 1001, workflowRunId: 200 };
    await repo.deleteRunningRun({ ...key, runAttempt: 2 }); // succeeded: stays
    await repo.deleteRunningRun({ ...key, runAttempt: 1 }); // running: goes
    const rows = (await repo.listRuns(workspaceId, 100)).filter((r) => r.run.workflowRunId === 200);
    expect(rows.map((r) => r.run.runAttempt)).toEqual([2]);
  });

  it('lists newest ran_at first within the limit, and returns the latest run per installation', async () => {
    const [inst] = await repo.allInstallations(workspaceId);
    const list = await repo.listRuns(workspaceId, 1);
    expect(list).toHaveLength(1);
    expect(list[0]!.run.workflowRunId).toBe(200);
    const latest = await repo.latestRuns([inst!.id]);
    expect(latest.get(inst!.id)!.run.workflowRunId).toBe(200);
  });

  it('shows runs of a deleted agent with no agent name', async () => {
    const db = pg.handle.db;
    await db.delete(t.agents).where(eq(t.agents.id, agentId));
    const rows = await repo.listRuns(workspaceId, 100);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.agentName === null && r.run.installationId === null)).toBe(true);
  });
});
