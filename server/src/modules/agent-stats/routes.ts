/**
 * Agent Performance HTTP module (read-only). Thin transport adapter: Zod
 * params / querystring / response, one service call.
 *
 *   GET /agents/performance?from&to            -> AgentPerf
 *   GET /agents/:id/stats?from&to              -> AgentStats
 *   GET /agents/:id/stats/runs?from&to&page    -> AgentRunHistoryPage
 *
 * `from`/`to` are ISO-8601 timestamps with an offset; the whole period
 * (order, not in the future, at most 367 days) is validated here, so an
 * invalid one is a 422 before the handler. An unknown or foreign agent is a 404.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AgentPerf, AgentRunHistoryPage, AgentStats } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { periodIssue } from '../_shared/stats-rules.js';

const periodFields = {
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
};

function checkPeriod(q: { from: string; to: string }, ctx: z.RefinementCtx): void {
  const issue = periodIssue(q.from, q.to, Date.now());
  if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ['to'] });
}

const PeriodQuery = z.object(periodFields).superRefine(checkPeriod);
const RunHistoryQuery = z
  .object({ ...periodFields, page: z.coerce.number().int().min(1) })
  .superRefine(checkPeriod);

export default async function agentStatsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.agentStatsService();

  app.get(
    '/agents/performance',
    { schema: { querystring: PeriodQuery, response: { 200: AgentPerf } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.performance(workspaceId, req.query.from, req.query.to);
    },
  );

  app.get(
    '/agents/:id/stats',
    { schema: { params: IdParams, querystring: PeriodQuery, response: { 200: AgentStats } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.agentStats(workspaceId, req.params.id, req.query.from, req.query.to);
    },
  );

  app.get(
    '/agents/:id/stats/runs',
    { schema: { params: IdParams, querystring: RunHistoryQuery, response: { 200: AgentRunHistoryPage } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.runHistory(workspaceId, req.params.id, req.query.from, req.query.to, req.query.page);
    },
  );
}
