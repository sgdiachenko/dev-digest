import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PrCommentInput, PrDetail, PrMeta, PrReviewComment } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PullsRepository } from './repository.js';
import { PullsService } from './service.js';

/**
 * F1 — pulls module. Transport only: parse, delegate to PullsService, serialize.
 *   GET  /repos/:id/pulls    → list PRs for a repo (synced from GitHub, persisted)
 *   GET  /pulls/:id          → full PR detail (files, commits, body)
 *   GET  /pulls/:id/comments → inline review comments (proxied live to GitHub)
 *   POST /pulls/:id/comments → create one inline review comment
 *
 * Import is idempotent (unique repo_id + number). Triggering a review is
 * MANUAL and owned by the reviews module — this one only imports/reads.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new PullsService(new PullsRepository(container.db), () => container.github());

  app.get(
    '/repos/:id/pulls',
    { schema: { params: IdParams, response: { 200: z.array(PrMeta) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listForRepo(workspaceId, req.params.id, req.log);
    },
  );

  app.get(
    '/pulls/:id',
    { schema: { params: IdParams, response: { 200: PrDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getDetail(workspaceId, req.params.id, req.log);
    },
  );

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams, response: { 200: z.array(PrReviewComment) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listComments(workspaceId, req.params.id, req.log);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput, response: { 200: PrReviewComment } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.createComment(workspaceId, req.params.id, req.body);
    },
  );
}
