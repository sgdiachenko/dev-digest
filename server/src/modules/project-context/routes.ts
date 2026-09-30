/**
 * project-context HTTP module.
 *
 *   GET  /repos/:id/context         → ContextCatalog (first open of a cloned repo starts a scan)
 *   GET  /repos/:id/context/file    → ContextDocContent (?path= must equal a catalogued path)
 *   POST /repos/:id/context/rescan  → 202; fetch + rebuild in the background
 *
 * Also registers the CONTEXT_SCAN_JOB_KIND handler, once, at plugin load.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ContextCatalog, ContextDocContent, ContextFileQuery, ContextRescanAccepted } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.projectContext;
  service.registerScanJobHandler(app.log);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextCatalog } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getCatalog(workspaceId, req.params.id, req.log);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: ContextFileQuery, response: { 200: ContextDocContent } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.readDoc(workspaceId, req.params.id, req.query.path);
    },
  );

  app.post(
    '/repos/:id/context/rescan',
    { schema: { params: IdParams, response: { 202: ContextRescanAccepted } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const accepted = await service.rescan(workspaceId, req.params.id, req.log);
      reply.code(202);
      return accepted;
    },
  );
}
