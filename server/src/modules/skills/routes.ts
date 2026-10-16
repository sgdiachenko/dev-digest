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
import { periodIssue } from '../_shared/stats-rules.js';
import { SkillsService } from './service.js';
import { SkillStatsService } from './stats-service.js';

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
 *   GET    /skills/:id/stats?from&to → Stats tab (optional period pair, default last 30 days)
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
  /** Source files the body's rules were extracted from — the Conventions
   *  Extractor's Create-skill modal sends its draft's `evidence_files` here. */
  evidence_files: z.array(z.string()).optional(),
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
/**
 * `from`/`to` are an optional PAIR of ISO-8601 timestamps with an offset: both
 * omitted = the last 30 days; exactly one = 422; both = a valid period (order,
 * not in the future, at most 367 days).
 */
const SkillStatsQuery = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.from === undefined && q.to === undefined) return;
    if (q.from === undefined || q.to === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from and to must be given together',
        path: [q.from === undefined ? 'from' : 'to'],
      });
      return;
    }
    const issue = periodIssue(q.from, q.to, Date.now());
    if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ['to'] });
  });

const ImportSkillUrlBody = z.object({ url: z.string().min(1).max(2048) });

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const stats = new SkillStatsService(app.container.skillsRepo, app.log);
  const service = new SkillsService(app.container.skillsRepo, stats);

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
        ...(body.evidence_files !== undefined ? { evidenceFiles: body.evidence_files } : {}),
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
    { schema: { params: IdParams, querystring: SkillStatsQuery, response: { 200: SkillStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return stats.forSkill(workspaceId, req.params.id, req.query.from, req.query.to);
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
  app.post('/skills/import-url', { schema: { body: ImportSkillUrlBody, response: { 200: SkillDraft } } }, async (req) => {
    await getContext(app.container, req);
    return service.importFromUrl(req.body.url);
  });
}
