import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * PR context for the run, taken from the `pull_request` event payload that
 * GitHub Actions writes to `GITHUB_EVENT_PATH` plus `GITHUB_REPOSITORY`. The
 * payload is `safeParse`d (C12); title, body and branch names are
 * author-controlled and reach the model only inside the untrusted PR block.
 */

const RepoRef = z.object({ id: z.number().int() });
const Side = z.object({
  sha: z.string().optional(),
  ref: z.string().optional(),
  repo: RepoRef.nullish(),
});
const EventPayload = z.object({
  action: z.string().optional(),
  pull_request: z.object({
    number: z.number().int().positive(),
    title: z.string().nullish(),
    body: z.string().nullish(),
    base: Side,
    head: Side,
  }),
});

export interface PrContext {
  owner: string;
  repo: string;
  prNumber: number;
  /** Event activity type (`opened`, `synchronize`, ...). */
  action: string;
  title: string;
  body: string;
  baseRef: string;
  headRef: string;
  /** Event commits: the diff is read between these, not from the live PR (EC-47). */
  baseSha: string | null;
  headSha: string | null;
  /** Head repo id differs from base repo id, or head repo is null (AC-162, AC-163). */
  isFork: boolean;
}

export type ContextResult = { ok: true; ctx: PrContext } | { ok: false; message: string };

const REPO_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const SHA40 = /^[0-9a-f]{40}$/i;

export function resolvePrContext(env: Record<string, string | undefined>): ContextResult {
  const repository = env.GITHUB_REPOSITORY;
  if (!repository || !REPO_NAME.test(repository)) {
    return { ok: false, message: 'GITHUB_REPOSITORY must be set to "owner/name"' };
  }
  const [owner, repo] = repository.split('/') as [string, string];

  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath) return { ok: false, message: 'GITHUB_EVENT_PATH is not set' };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(eventPath, 'utf8'));
  } catch (err) {
    return { ok: false, message: `cannot read the event payload: ${(err as Error).message}` };
  }
  const parsed = EventPayload.safeParse(json);
  if (!parsed.success) return { ok: false, message: 'the event payload is not a pull_request event' };

  const pr = parsed.data.pull_request;
  const baseId = pr.base.repo?.id;
  const headId = pr.head.repo?.id;
  // Fail closed: an unknown base or head repository is treated as a fork.
  const isFork = baseId === undefined || headId === undefined || baseId !== headId;
  return {
    ok: true,
    ctx: {
      owner,
      repo,
      prNumber: pr.number,
      action: parsed.data.action ?? '',
      title: pr.title ?? '',
      body: pr.body ?? '',
      baseRef: pr.base.ref ?? '',
      headRef: pr.head.ref ?? '',
      baseSha: pr.base.sha && SHA40.test(pr.base.sha) ? pr.base.sha : null,
      headSha: pr.head.sha && SHA40.test(pr.head.sha) ? pr.head.sha : null,
      isFork,
    },
  };
}
