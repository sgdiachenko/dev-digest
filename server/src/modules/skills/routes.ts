import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  SKILL_NAME_RE,
  Skill,
  SkillDraft,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
  SkillWithStats,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams, OkAck } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/**
 * Skills module — CRUD over reusable prompt-rule documents, plus the
 * file-import parser and the Stats/Versions editor tabs.
 *
 *   GET    /skills                    → list, with Stats-tab counters (workspace-scoped)
 *   GET    /skills/:id                → one skill
 *   POST   /skills                    → create (source: manual)
 *   PUT    /skills/:id                → update; a body change bumps version
 *   DELETE /skills/:id                → delete
 *   GET    /skills/:id/stats          → Stats tab
 *   GET    /skills/:id/versions       → body-snapshot history (newest first)
 *   GET    /skills/:id/versions/:version → one snapshot (Diff modal)
 *   POST   /skills/:id/restore        → restore a past snapshot (appends a new version)
 *   POST   /skills/import             → parse a .md/.zip upload — PERSISTS NOTHING
 *
 * Linking a skill to an agent stays on the agents module
 * (`GET|POST /agents/:id/skills`) — the agent side owns order/link state.
 */

const CreateSkillBody = z.object({
  name: z.string().regex(SKILL_NAME_RE, 'Use lowercase letters, numbers and hyphens (e.g. pr-quality-rubric)'),
  description: z.string().optional(),
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  /** Defaults to 'manual'. The import confirm step sends the SkillDraft's own
   *  source (e.g. 'imported_url') so trust-per-source carries through to the
   *  prompt (see ReviewRunExecutor.buildSkillBlocks). */
  source: SkillSource.optional(),
});

const UpdateSkillBody = z.object({
  name: z
    .string()
    .regex(SKILL_NAME_RE, 'Use lowercase letters, numbers and hyphens (e.g. pr-quality-rubric)')
    .optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  /** "What changed?" — only recorded when `body` actually changes this call. */
  note: z.string().nullish(),
  enabled: z.boolean().optional(),
});

const RestoreSkillBody = z.object({ version: z.number().int().positive() });

const ImportSkillBody = z.object({
  filename: z.string().min(1),
  content_b64: z.string().min(1),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container.skillsRepo);

  app.get('/skills', { schema: { response: { 200: z.array(SkillWithStats) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get(
    '/skills/:id',
    { schema: { params: IdParams, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.get(workspaceId, req.params.id);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.post(
    '/skills',
    { schema: { body: CreateSkillBody, response: { 201: Skill } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      const skill = await service.create(workspaceId, {
        name: body.name,
        type: body.type,
        body: body.body,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.source !== undefined ? { source: body.source } : {}),
      });
      reply.status(201);
      return skill;
    },
  );

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      const skill = await service.update(workspaceId, req.params.id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      });
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete(
    '/skills/:id',
    { schema: { params: IdParams, response: { 200: OkAck } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const ok = await service.delete(workspaceId, req.params.id);
      if (!ok) throw new NotFoundError('Skill not found');
      return { ok: true };
    },
  );

  app.get(
    '/skills/:id/stats',
    { schema: { params: IdParams, response: { 200: SkillStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const stats = await service.stats(workspaceId, req.params.id);
      if (!stats) throw new NotFoundError('Skill not found');
      return stats;
    },
  );

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams, response: { 200: z.array(SkillVersion) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const versions = await service.listVersions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError('Skill not found');
      return versions;
    },
  );

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: VersionParams, response: { 200: SkillVersion } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const version = await service.getVersion(workspaceId, req.params.id, req.params.version);
      if (!version) throw new NotFoundError('Skill version not found');
      return version;
    },
  );

  app.post(
    '/skills/:id/restore',
    { schema: { params: IdParams, body: RestoreSkillBody, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restore(workspaceId, req.params.id, req.body.version);
      if (!skill) throw new NotFoundError('Skill or version not found');
      return skill;
    },
  );

  app.post(
    '/skills/import',
    { schema: { body: ImportSkillBody, response: { 200: SkillDraft } } },
    async (req) => {
      await getContext(app.container, req); // auth-gated, but import is stateless (no persistence)
      return service.importFromFile(req.body.filename, req.body.content_b64);
    },
  );
}
