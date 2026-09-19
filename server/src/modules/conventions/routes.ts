import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionCandidate, ConventionScan, ConventionSkillDraft, ConventionStatus } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams, OkAck } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';

/**
 * Conventions Extractor — scan a repo for its house rules, triage them, turn
 * the accepted ones into a skill.
 *
 *   GET    /repos/:id/conventions             → this repo's candidates
 *   GET    /repos/:id/conventions/scan        → the latest scan (poll target)
 *   POST   /repos/:id/conventions/extract     → 202, schedules a scan (sample
 *                                                runs now; the model call runs
 *                                                on the job queue)
 *   POST   /repos/:id/conventions/deselect-all → every accepted row → pending
 *   POST   /repos/:id/conventions/skill       → skill DRAFT from accepted (no write)
 *   PATCH  /conventions/:id                   → accept / reject / edit the rule
 *   DELETE /conventions/:id                   → drop a candidate
 */

const ExtractParams = z.object({ id: z.string().uuid() });

const UpdateConventionBody = z.object({
  rule: z.string().min(1).optional(),
  rationale: z.string().nullable().optional(),
  status: ConventionStatus.optional(),
});

/** Optional explicit selection; omitted means "every accepted candidate". */
const SkillDraftBody = z.object({ convention_ids: z.array(z.string().uuid()).optional() }).default({});

const ExtractAccepted = z.object({
  status: z.literal('accepted'),
  scan_id: z.string(),
  job_id: z.string().nullable(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = new ConventionsService(
    new ConventionsRepository(c.db),
    c.reposRepo,
    c.skillsRepo,
    c.repoIntel,
    c.git,
    c.codeIndex,
    c.jobs,
    (provider) => c.llm(provider),
    (workspaceId) => resolveFeatureModel(c, workspaceId, 'conventions'),
  );

  // Register the extraction job handler once, at plugin load.
  service.registerExtractJobHandler();

  app.get(
    '/repos/:id/conventions',
    { schema: { params: ExtractParams, response: { 200: z.array(ConventionCandidate) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/conventions/scan',
    { schema: { params: ExtractParams, response: { 200: ConventionScan.nullable() } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const scan = await service.latestScan(workspaceId, req.params.id);
      return scan ?? null;
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: ExtractParams, response: { 202: ExtractAccepted } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { scanId, jobId } = await service.startExtraction(workspaceId, req.params.id);
      reply.status(202);
      return { status: 'accepted' as const, scan_id: scanId, job_id: jobId };
    },
  );

  app.post(
    '/repos/:id/conventions/deselect-all',
    { schema: { params: ExtractParams, response: { 200: z.array(ConventionCandidate) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.deselectAllAccepted(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: ExtractParams, body: SkillDraftBody, response: { 200: ConventionSkillDraft } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.skillDraft(workspaceId, req.params.id, req.body.convention_ids);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody, response: { 200: ConventionCandidate } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.update(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );

  app.delete(
    '/conventions/:id',
    { schema: { params: IdParams, response: { 200: OkAck } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const ok = await service.delete(workspaceId, req.params.id);
      if (!ok) throw new NotFoundError('Convention not found');
      return { ok: true };
    },
  );
}
