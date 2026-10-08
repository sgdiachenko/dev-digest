import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefRecord } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * PR Brief module.
 *   GET  /pulls/:id/brief  → the stored `PrBriefRecord`, or `null` when none
 *                            (404 only means "PR doesn't exist"); never calls
 *                            the LLM / GitHub / git.
 *   POST /pulls/:id/brief  → synchronous generation (≤75 s, single-flight per
 *                            PR, 10/min per workspace); persists even if the
 *                            caller disconnects.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.briefService();

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefRecord.nullable() } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getBrief(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefRecord } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id, req.log);
    },
  );
}
