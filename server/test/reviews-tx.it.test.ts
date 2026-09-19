/**
 * Atomicity of the review-persistence writes.
 *
 * A review row and its findings are one fact — "this agent run produced this
 * review". Persisted separately, a failure on the findings insert leaves a
 * review with zero findings, and every counter in the app (PR-list
 * findings_summary, the timeline popover, the run badge) reads that as "this
 * run found nothing" rather than "this run half-failed".
 *
 * These tests force the second write to fail and assert nothing survives.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Finding } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

function finding(o: Partial<Finding> = {}): Finding {
  return {
    id: 'f-1',
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded secret',
    file: 'src/config.ts',
    start_line: 11,
    end_line: 11,
    rationale: 'A live key is committed in source.',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    ...o,
  } as Finding;
}

d('review persistence is transactional', () => {
  let pg: PgFixture;
  let repo: ReviewRepository;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [pr] = await pg.handle.db.select().from(t.pullRequests).limit(1);
    prId = pr!.id;
    repo = new ReviewRepository(pg.handle.db);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  const values = () => ({
    workspaceId,
    prId,
    agentId: null,
    runId: null,
    kind: 'review' as const,
    verdict: 'request_changes' as const,
    summary: 'Two exposures.',
    score: 42,
    model: 'test-model',
  });

  it('commits the review AND its findings together on the happy path', async () => {
    const before = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, prId));

    const { review, findings } = await repo.insertReviewWithFindings(values(), [
      finding({ id: 'f-a' }),
      finding({ id: 'f-b', severity: 'WARNING' }),
    ]);

    expect(findings).toHaveLength(2);
    const after = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, prId));
    expect(after.length).toBe(before.length + 1);

    const persisted = await pg.handle.db
      .select()
      .from(t.findings)
      .where(eq(t.findings.reviewId, review.id));
    expect(persisted).toHaveLength(2);
  });

  it('rolls the review back when a finding fails to insert — no orphan review row', async () => {
    const before = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, prId));

    // `rationale` is NOT NULL in the findings table, so this insert fails AFTER
    // the review row has already been written inside the same transaction.
    const bad = finding({ id: 'f-bad', rationale: null as unknown as string });

    await expect(repo.insertReviewWithFindings(values(), [finding({ id: 'f-ok' }), bad])).rejects.toThrow();

    const after = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, prId));
    expect(after.length).toBe(before.length);

    // And the one finding that DID insert before the failure is gone too.
    const beforeIds = new Set(before.map((r) => r.id));
    const orphaned = after.filter((r) => !beforeIds.has(r.id));
    expect(orphaned).toEqual([]);
  });

  it('deleteAgentRun removes the run and its reviews together', async () => {
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId, status: 'done' })
      .returning();

    await repo.insertReviewWithFindings({ ...values(), runId: run!.id }, [finding({ id: 'f-c' })]);

    const deleted = await repo.deleteAgentRun(workspaceId, run!.id);
    expect(deleted).toBe(true);

    const runsLeft = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, run!.id));
    const reviewsLeft = await pg.handle.db
      .select()
      .from(t.reviews)
      .where(eq(t.reviews.runId, run!.id));
    expect(runsLeft).toEqual([]);
    expect(reviewsLeft).toEqual([]);
  });
});
