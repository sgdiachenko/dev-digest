import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrHistory } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * PR History module (P3/E5).
 *   GET /pulls/:id/history → merged PRs that previously touched the same
 *                             files as this PR. A separate route (not a field
 *                             on `/pulls/:id/blast`) so the client only pays
 *                             for the GitHub reads when the collapsible
 *                             "Prior PRs" section is actually expanded.
 */
export default async function prHistoryRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/history',
    { schema: { params: IdParams, response: { 200: PrHistory } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const service = await container.prHistoryService();
      return service.getHistory(workspaceId, req.params.id);
    },
  );
}
