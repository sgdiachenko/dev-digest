import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Smart Diff module.
 *   GET /pulls/:id/smart-diff → the PR's changed files grouped by role
 *                                (core → tests → wiring → docs →
 *                                boilerplate), each carrying the kept
 *                                findings from its latest review round.
 *                                Pure read — deterministic classifier, no
 *                                LLM/GitHub/git call.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.smartDiffService();

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getSmartDiff(workspaceId, req.params.id);
    },
  );
}
