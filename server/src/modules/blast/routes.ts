import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Blast radius module.
 *   GET /pulls/:id/blast → the PR's changed symbols, their known callers
 *                           (file:line), and the endpoints/crons downstream
 *                           of them. Pure read over repo-intel's precomputed
 *                           call graph — no fresh analysis, no LLM call.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.blastService();

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getBlast(workspaceId, req.params.id);
    },
  );
}
