import { z } from 'zod';
import {
  Agent,
  BlastRadiusResponse,
  ConventionCandidate,
  ConventionStatus,
  Finding,
  ReviewRecord,
  Verdict,
} from './vendor/shared/index.js';

/**
 * Compact response shapes (course principle 3: only the fields the calling
 * agent needs, never a raw persisted-row dump) + the mappers that produce
 * them from the full `@devdigest/shared` records.
 */

// ---- list_agents --------------------------------------------------------

export const AgentCompact = Agent.pick({
  id: true,
  name: true,
  description: true,
  provider: true,
  model: true,
  enabled: true,
});
export type AgentCompact = z.infer<typeof AgentCompact>;

export const ListAgentsOutput = z.object({ agents: z.array(AgentCompact) });
export type ListAgentsOutput = z.infer<typeof ListAgentsOutput>;

export function toAgentCompact(agent: Agent): AgentCompact {
  return AgentCompact.parse(agent);
}

// ---- run_agent_on_pull_request / get_findings ---------------------------

/** A finding, with persisted-row bookkeeping (`review_id`, `accepted_at`, …) cut. */
export const FindingCompact = Finding.pick({
  id: true,
  severity: true,
  category: true,
  title: true,
  file: true,
  start_line: true,
  end_line: true,
  rationale: true,
  suggestion: true,
});
export type FindingCompact = z.infer<typeof FindingCompact>;

export const ReviewResult = z.object({
  run_id: z.string(),
  verdict: Verdict,
  summary: z.string(),
  score: z.number().int(),
  findings: z.array(FindingCompact),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

/**
 * `review` is the `ReviewRecord` whose `run_id` matches. Dismissed findings
 * are excluded (D8) — they cannot appear on a run that just finished, but can
 * on a later `get_findings` call for the same `run_id` after a human dismisses
 * one in the web UI.
 */
export function toReviewResult(runId: string, review: ReviewRecord): ReviewResult {
  const findings = review.findings
    .filter((f) => f.dismissed_at == null)
    .map((f) => FindingCompact.parse(f));
  return ReviewResult.parse({
    run_id: runId,
    verdict: review.verdict ?? 'comment',
    summary: review.summary ?? '',
    score: review.score ?? 0,
    findings,
  });
}

/** One agent's most recent review of a PR — the `get_findings` element shape. */
export const AgentReviewSummary = z.object({
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  run_id: z.string().nullable(),
  verdict: Verdict,
  summary: z.string(),
  score: z.number().int(),
  total_findings: z.number().int(),
  findings: z.array(FindingCompact),
});
export type AgentReviewSummary = z.infer<typeof AgentReviewSummary>;

export const GetFindingsOutput = z.object({
  /** The run_id the caller asked about — kept for traceability, even though
   *  `reviews` below covers every agent's latest review of the PR. */
  run_id: z.string(),
  reviews: z.array(AgentReviewSummary),
});
export type GetFindingsOutput = z.infer<typeof GetFindingsOutput>;

/**
 * The whole PR's current findings picture, not just the one run the caller
 * named: every `kind: 'review'` record, grouped by `agent_id`, keeping only
 * the newest (`created_at`) review per agent. A hand-seeded review with no
 * `agent_id` is never merged with another — each is its own one-review group.
 * Dismissed findings are excluded per group (D8), same as `toReviewResult`.
 */
export function toGetFindingsOutput(runId: string, reviews: ReviewRecord[]): GetFindingsOutput {
  const latestByAgent = new Map<string, ReviewRecord>();
  const unowned: ReviewRecord[] = [];
  for (const r of reviews) {
    if (r.kind !== 'review') continue;
    if (r.agent_id == null) {
      unowned.push(r);
      continue;
    }
    const prior = latestByAgent.get(r.agent_id);
    if (!prior || new Date(r.created_at) > new Date(prior.created_at)) {
      latestByAgent.set(r.agent_id, r);
    }
  }

  const toSummary = (r: ReviewRecord): AgentReviewSummary => {
    const findings = r.findings
      .filter((f) => f.dismissed_at == null)
      .map((f) => FindingCompact.parse(f));
    return AgentReviewSummary.parse({
      agent_id: r.agent_id,
      agent_name: r.agent_name ?? null,
      run_id: r.run_id,
      verdict: r.verdict ?? 'comment',
      summary: r.summary ?? '',
      score: r.score ?? 0,
      total_findings: findings.length,
      findings,
    });
  };

  // Newest review first — sort the source records (which carry `created_at`)
  // before mapping, so the summary itself never needs that field.
  const summaries = [...latestByAgent.values(), ...unowned]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(toSummary);

  return GetFindingsOutput.parse({ run_id: runId, reviews: summaries });
}

// ---- get_conventions ------------------------------------------------------

/** D5: only `accepted` candidates are ever surfaced to an MCP caller — a
 *  named, easily-flipped flag rather than an unexplained hardcoded filter. */
export const ACCEPTED_ONLY: ConventionStatus = 'accepted';

export const ConventionCompact = ConventionCandidate.pick({
  rule: true,
  rationale: true,
  category: true,
});
export type ConventionCompact = z.infer<typeof ConventionCompact>;

export const GetConventionsOutput = z.object({ conventions: z.array(ConventionCompact) });
export type GetConventionsOutput = z.infer<typeof GetConventionsOutput>;

export function toConventionCompacts(candidates: ConventionCandidate[]): ConventionCompact[] {
  return candidates
    .filter((c) => c.status === ACCEPTED_ONLY)
    .map((c) => ConventionCompact.parse(c));
}

// ---- get_blast_radius -----------------------------------------------------

/** The API's own response is already compact (S1: additive over `BlastRadius`
 *  with `degraded`/`reason`) — no further trimming needed here. */
export const GetBlastRadiusOutput = BlastRadiusResponse;
export type GetBlastRadiusOutput = z.infer<typeof GetBlastRadiusOutput>;
