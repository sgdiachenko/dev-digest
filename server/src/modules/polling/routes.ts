import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { PollingRepository } from './repository.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * F1 — polling module. MANUAL refresh that ONLY syncs the PR list
 * (new/updated PRs appear, head_sha updates). It does NOT trigger any review —
 * review is manual (user presses Run Review, owned by A2).
 *
 *   POST /repos/:id/poll  → sync PR list from GitHub, bump last_polled_at
 */
/** Result of a manual PR-list sync. `reviewTriggered` is always false here —
 *  review is a separate, explicit user action (see the note below). */
const PollResult = z.object({
  synced: z.number().int(),
  reviewTriggered: z.boolean(),
});

export default async function pollingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const repo = new PollingRepository(container.db);

  app.post(
    '/repos/:id/poll',
    { schema: { params: IdParams, response: { 200: PollResult } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const target = await repo.findRepo(workspaceId, req.params.id);
      if (!target) throw new NotFoundError('Repo not found');

      const gh = await container.github();
      const pulls = await gh.listPullRequests({ owner: target.owner, name: target.name });
      for (const pr of pulls) {
        await repo.upsertPull(workspaceId, target.id, pr);
      }
      await repo.markPolled(target.id);

      // NOTE: no review is triggered here — manual trigger only.
      return { synced: pulls.length, reviewTriggered: false };
    },
  );
}
