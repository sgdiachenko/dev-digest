import { z } from 'zod';
import {
  Agent,
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

/** D4: a soft stub — always this exact shape, never `isError`. */
export const GetBlastRadiusOutput = z.object({
  implemented: z.literal(false),
  message: z.string(),
  affected_files: z.array(z.string()),
});
export type GetBlastRadiusOutput = z.infer<typeof GetBlastRadiusOutput>;
