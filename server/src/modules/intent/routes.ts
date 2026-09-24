import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentRecord } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { POST_INTENT_RATE_LIMIT } from './constants.js';

/**
 * Intent Layer module.
 *   GET  /pulls/:id/intent  → the cached `PrIntentRecord`, or `null` if never
 *                             derived (404 only means "PR doesn't exist");
 *                             never calls the LLM/GitHub/git.
 *   POST /pulls/:id/intent  → synchronous re-derivation (ignores the cache,
 *                             ≤30s); persists even if the caller disconnects.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.intentService();

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentRecord.nullable() } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getIntent(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, response: { 200: PrIntentRecord } },
      config: { rateLimit: POST_INTENT_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.deriveIntent(workspaceId, req.params.id, req.log);
    },
  );
}
