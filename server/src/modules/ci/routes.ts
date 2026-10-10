/**
 * Export to CI HTTP module. Thin transport adapter: Zod params / body /
 * response, one service call, a status code.
 *
 *   POST /agents/:id/export-ci          -> CiExport     (action files | open_pr)
 *   GET  /agents/:id/ci-installations   -> CiInstallation[]
 *   GET  /ci-runs?limit=                -> CiRun[]
 *   POST /ci-runs/refresh               -> { results: [...] }
 *
 * Errors (AppError) become `{ error: { code, message } }` via the app error
 * handler: github_token_missing 400, github_scope_missing 403,
 * repo_not_accessible 404, branch_exists_without_pr / agent_slug_conflict 409,
 * github_unavailable / runner_bundle_unavailable 503.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CI_LIMITS,
  CiExport,
  CiExportInput,
  CiInstallation,
  CiRefreshResponse,
  CiRun,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

const RunsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(CI_LIMITS.RUNS_PAGE_MAX).default(CI_LIMITS.RUNS_PAGE_MAX),
});

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.ciService();
  const sync = container.ciSyncService();

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput, response: { 200: CiExport } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.exportCi(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/ci-installations',
    { schema: { params: IdParams, response: { 200: z.array(CiInstallation) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listInstallations(workspaceId, req.params.id);
    },
  );

  app.get(
    '/ci-runs',
    { schema: { querystring: RunsQuery, response: { 200: z.array(CiRun) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return sync.listRuns(workspaceId, req.query.limit);
    },
  );

  app.post(
    '/ci-runs/refresh',
    { schema: { response: { 200: CiRefreshResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return sync.refresh(workspaceId);
    },
  );
}
