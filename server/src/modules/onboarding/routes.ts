/**
 * onboarding HTTP module.
 *
 *   GET /repos/:id/tour  → Onboarding (deterministic facts + optional narrative overlay;
 *                          never calls an LLM)
 *   POST /repos/:id/tour/narrative → 202 { status, generation_id, already_running } (generation
 *                          runs in the background); 409 { reason } when the tour is unavailable;
 *                          404 unknown repo; 429 over the per-workspace limit
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { NarrativeGenerateAccepted, NarrativeUnavailable, Onboarding } from '@devdigest/shared';
import { NotFoundError, TooManyRequestsError } from '../../platform/errors.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/repos/:id/tour',
    { schema: { params: IdParams, response: { 200: Onboarding } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.onboarding.getTour(workspaceId, req.params.id, req.log);
    },
  );

  app.post(
    '/repos/:id/tour/narrative',
    {
      schema: {
        params: IdParams,
        response: { 202: NarrativeGenerateAccepted, 409: NarrativeUnavailable },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const outcome = await container.onboardingNarrative.requestGeneration(
        workspaceId,
        req.params.id,
        req.log,
      );
      switch (outcome.kind) {
        case 'rate_limited':
          throw new TooManyRequestsError('Too many narrative generations; try again in a minute');
        case 'not_found':
          throw new NotFoundError('Repo not found');
        case 'unavailable':
          return reply.code(409).send({ reason: 'tour_unavailable' as const });
        case 'accepted':
          return reply.code(202).send({
            status: 'accepted' as const,
            generation_id: outcome.id,
            already_running: outcome.alreadyRunning,
          });
      }
    },
  );
}
