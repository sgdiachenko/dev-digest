/**
 * context-attachments HTTP module — Project Context documents pinned to agents and skills.
 *
 *   GET /agents/:id/context?repo_id=  → AgentContextView
 *   PUT /agents/:id/context?repo_id=  → AgentContextView (full ordered list across all repos)
 *   GET /skills/:id/context?repo_id=  → SkillContextView
 *   PUT /skills/:id/context?repo_id=  → SkillContextView
 *
 * `repo_id` selects the repository the returned budget / estimates are computed for.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AgentContextView,
  ContextAttachmentsBody,
  ContextViewQuery,
  SkillContextView,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

export default async function contextAttachmentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.contextAttachments;

  app.get(
    '/agents/:id/context',
    { schema: { params: IdParams, querystring: ContextViewQuery, response: { 200: AgentContextView } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getAgentView(workspaceId, req.params.id, req.query.repo_id, req.log);
    },
  );

  app.put(
    '/agents/:id/context',
    {
      schema: {
        params: IdParams,
        querystring: ContextViewQuery,
        body: ContextAttachmentsBody,
        response: { 200: AgentContextView },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.putAgent(workspaceId, req.params.id, req.query.repo_id, req.body, req.log);
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams, querystring: ContextViewQuery, response: { 200: SkillContextView } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getSkillView(workspaceId, req.params.id, req.query.repo_id, req.log);
    },
  );

  app.put(
    '/skills/:id/context',
    {
      schema: {
        params: IdParams,
        querystring: ContextViewQuery,
        body: ContextAttachmentsBody,
        response: { 200: SkillContextView },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.putSkill(workspaceId, req.params.id, req.query.repo_id, req.body, req.log);
    },
  );
}
