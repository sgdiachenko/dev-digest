/**
 * Shared performance dataset for the stats endpoints (agent-stats NFR-1/NFR-2
 * and the skill Stats tab budgets). Bulk-inserts agents, runs spread over
 * `days`, traces carrying `config.skills` plus filler (`raw_output`/`log`, like
 * a real trace, so a whole-trace read would be visible in the timings), one
 * review per done run and findings spread over the reviews. Inserts go in
 * chunks of at most 1,000 rows.
 */
import { randomUUID } from 'node:crypto';
import * as t from '../../src/db/schema.js';
import type { Db } from '../../src/db/client.js';

export interface StatsDatasetOptions {
  agents: number;
  runs: number;
  findings: number;
  days: number;
  traceExtraBytes: number;
  /** Workspace skills to create (unique names), each linked to at least one agent. */
  skills: number;
}

export const DEFAULT_STATS_DATASET: StatsDatasetOptions = {
  agents: 20,
  runs: 10_000,
  findings: 50_000,
  days: 400,
  traceExtraBytes: 5_000,
  skills: 0,
};

export interface StatsDataset {
  agentIds: string[];
  runIds: string[];
  skillIds: string[];
  skillNames: string[];
  /** Skill ids linked to each agent (by agent id). */
  linksByAgent: Record<string, string[]>;
}

const DAY_MS = 86_400_000;
const CHUNK = 1000;

async function insertChunked<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

export async function buildStatsDataset(
  db: Db,
  workspaceId: string,
  opts: Partial<StatsDatasetOptions> = {},
  now = new Date(),
): Promise<StatsDataset> {
  const o = { ...DEFAULT_STATS_DATASET, ...opts };
  const tag = randomUUID().slice(0, 8);

  const agentIds = Array.from({ length: o.agents }, () => randomUUID());
  await insertChunked(agentIds, (chunk) =>
    db.insert(t.agents).values(
      chunk.map((id, i) => ({
        id,
        workspaceId,
        name: `perf-agent-${tag}-${String(i).padStart(3, '0')}`,
        provider: 'openai' as const,
        model: i % 2 === 0 ? 'gpt-4.1' : 'gpt-4.1-mini',
        systemPrompt: 'perf',
      })),
    ),
  );

  const skillIds = Array.from({ length: o.skills }, () => randomUUID());
  const skillNames = skillIds.map((_, i) => `perf-skill-${tag}-${i}`);
  const linksByAgent: Record<string, string[]> = Object.fromEntries(agentIds.map((id) => [id, []]));
  if (o.skills > 0) {
    await insertChunked(skillIds, (chunk) =>
      db.insert(t.skills).values(
        chunk.map((id) => ({
          id,
          workspaceId,
          name: skillNames[skillIds.indexOf(id)]!,
          description: 'perf skill',
          type: 'custom' as const,
          source: 'manual' as const,
          body: 'perf',
        })),
      ),
    );
    const links: { agentId: string; skillId: string }[] = [];
    skillIds.forEach((skillId, i) => {
      // Every skill is linked to at least one agent; a few get a second one.
      for (const agentId of new Set([agentIds[i % o.agents]!, agentIds[(i * 7 + 3) % o.agents]!])) {
        links.push({ agentId, skillId });
        linksByAgent[agentId]!.push(skillId);
      }
    });
    await insertChunked(links, (chunk) => db.insert(t.agentSkills).values(chunk));
  }

  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'perf', name: `repo-${tag}`, fullName: `perf/repo-${tag}` })
    .returning({ id: t.repos.id });
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'perf',
      author: 'perf',
      branch: 'perf',
      base: 'main',
      headSha: 'abc',
    })
    .returning({ id: t.pullRequests.id });

  const filler = 'x'.repeat(o.traceExtraBytes);
  const runs = Array.from({ length: o.runs }, (_, i) => {
    const id = randomUUID();
    const agentId = agentIds[i % o.agents]!;
    const status = i % 20 === 0 ? 'failed' : i % 33 === 0 ? 'cancelled' : 'done';
    // Spread over `days`, newest first, at most 1 s apart per index.
    const ranAt = new Date(now.getTime() - 1000 - Math.floor((i / o.runs) * o.days * DAY_MS));
    const linked = linksByAgent[agentId]!;
    const recorded = status === 'done' ? linked.slice(0, 1 + (i % 3)) : undefined;
    return { id, agentId, status, ranAt, recorded, i };
  });

  await insertChunked(runs, (chunk) =>
    db.insert(t.agentRuns).values(
      chunk.map((r) => ({
        id: r.id,
        workspaceId,
        agentId: r.agentId,
        prId: pr!.id,
        ranAt: r.ranAt,
        provider: 'openai',
        model: r.i % 2 === 0 ? 'gpt-4.1' : 'gpt-4.1-mini',
        durationMs: 5000 + (r.i % 50) * 100,
        tokensIn: r.status === 'done' ? 1000 : 0,
        tokensOut: r.status === 'done' ? 200 : 0,
        costUsd: r.status === 'done' ? 0.001 * ((r.i % 9) + 1) : null,
        status: r.status,
        source: 'local' as const,
        findingsCount: 0,
      })),
    ),
  );
  await insertChunked(runs, (chunk) =>
    db.insert(t.runTraces).values(
      chunk.map((r) => ({
        runId: r.id,
        trace: {
          config: r.recorded ? { agent: r.agentId, skills: r.recorded } : { agent: r.agentId },
          raw_output: filler,
          log: [{ level: 'info', message: filler }],
        },
      })),
    ),
  );

  const doneRuns = runs.filter((r) => r.status === 'done');
  const reviews = doneRuns.map((r) => ({ id: randomUUID(), runId: r.id, agentId: r.agentId }));
  await insertChunked(reviews, (chunk) =>
    db.insert(t.reviews).values(
      chunk.map((rv) => ({
        id: rv.id,
        workspaceId,
        prId: pr!.id,
        agentId: rv.agentId,
        runId: rv.runId,
        kind: 'review' as const,
        verdict: 'comment',
        summary: 'perf',
        score: 80,
        model: 'perf',
      })),
    ),
  );

  const severities = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;
  const categories = ['bug', 'security', 'perf', 'style', 'test'] as const;
  const findingRows = Array.from({ length: o.findings }, (_, i) => ({
    reviewId: reviews[i % reviews.length]!.id,
    file: `src/f${i % 40}.ts`,
    startLine: 1,
    endLine: 1,
    severity: severities[i % 3]!,
    category: categories[i % 5]!,
    title: `finding ${i}`,
    rationale: 'perf',
    confidence: 0.9,
    acceptedAt: i % 4 === 0 ? new Date(now.getTime() - 1000) : null,
    dismissedAt: i % 4 === 1 ? new Date(now.getTime() - 1000) : null,
  }));
  if (reviews.length > 0) {
    await insertChunked(findingRows, (chunk) => db.insert(t.findings).values(chunk));
  }

  return { agentIds, runIds: runs.map((r) => r.id), skillIds, skillNames, linksByAgent };
}
