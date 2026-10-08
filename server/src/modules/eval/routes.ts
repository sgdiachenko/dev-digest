/**
 * eval HTTP module (L06). Thin transport adapter: Zod params / body / response,
 * one service call, a status code.
 *
 *   GET    /findings/:id/eval-draft       -> EvalCaseDraft
 *   POST   /agents/:id/eval-attempts      -> 202 { attempt_id }
 *   POST   /eval-cases/:id/attempts       -> 202 { attempt_id }
 *   GET    /eval-attempts/:id             -> EvalAttempt
 *   GET    /agents/:id/eval-cases         -> EvalCase[]
 *   POST   /agents/:id/eval-cases         -> 201 EvalCase
 *   PUT    /eval-cases/:id                -> EvalCase
 *   DELETE /eval-cases/:id                -> { ok: true }
 *   POST   /agents/:id/eval-runs          -> 202 { run_id }
 *   GET    /agents/:id/eval-runs?since=   -> EvalSuiteRunSummary[]
 *   GET    /eval-runs/compare?a=&b=       -> EvalRunComparison
 *   GET    /eval-runs/:id                 -> EvalSuiteRun
 *   POST   /eval-runs/:id/cancel          -> EvalSuiteRunSummary
 *   GET    /eval/overview                 -> EvalOverview
 *   POST   /eval/run-all                  -> 202 { run_ids }
 *
 * Every route is workspace-scoped; an unknown or foreign id is a 404.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalAttempt,
  EvalAttemptStartResponse,
  EvalCase,
  EvalCaseDraft,
  EvalCaseInput,
  EvalOverview,
  EvalRunComparison,
  EvalRunStartResponse,
  EvalSuiteRun,
  EvalSuiteRunSummary,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams, OkAck } from '../_shared/schemas.js';

const RunsQuery = z.object({ since: z.string().datetime({ offset: true }).optional() });
const CompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });
const RunAllResponse = z.object({ run_ids: z.array(z.string()) });

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.evalService();
  const attempts = container.evalAttemptService();
  const suiteRuns = container.evalSuiteRunService();

  // ---- draft ---------------------------------------------------------------

  app.get(
    '/findings/:id/eval-draft',
    { schema: { params: IdParams, response: { 200: EvalCaseDraft } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getDraft(workspaceId, req.params.id);
    },
  );

  // ---- attempts (unpersisted "Run case") -------------------------------------

  app.post(
    '/agents/:id/eval-attempts',
    {
      schema: {
        params: IdParams,
        body: EvalCaseInput,
        response: { 202: EvalAttemptStartResponse },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const started = await attempts.start(workspaceId, req.params.id, req.body);
      return reply.code(202).send(started);
    },
  );

  app.post(
    '/eval-cases/:id/attempts',
    { schema: { params: IdParams, response: { 202: EvalAttemptStartResponse } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const started = await attempts.startForCase(workspaceId, req.params.id);
      return reply.code(202).send(started);
    },
  );

  app.get(
    '/eval-attempts/:id',
    { schema: { params: IdParams, response: { 200: EvalAttempt } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return attempts.get(workspaceId, req.params.id);
    },
  );

  // ---- cases ---------------------------------------------------------------

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCase) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseInput, response: { 201: EvalCase } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await service.createCase(workspaceId, req.params.id, req.body);
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCaseInput, response: { 200: EvalCase } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: OkAck } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      await service.deleteCase(workspaceId, req.params.id);
      return { ok: true };
    },
  );

  // ---- suite runs ------------------------------------------------------------

  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 202: EvalRunStartResponse } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const started = await suiteRuns.start(workspaceId, req.params.id);
      return reply.code(202).send(started);
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    {
      schema: {
        params: IdParams,
        querystring: RunsQuery,
        response: { 200: z.array(EvalSuiteRunSummary) },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listRuns(workspaceId, req.params.id, req.query.since);
    },
  );

  // Static segment: registered before `/eval-runs/:id` (find-my-way prefers it anyway).
  app.get(
    '/eval-runs/compare',
    { schema: { querystring: CompareQuery, response: { 200: EvalRunComparison } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.compare(workspaceId, req.query.a, req.query.b);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalSuiteRun } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getRun(workspaceId, req.params.id);
    },
  );

  app.post(
    '/eval-runs/:id/cancel',
    { schema: { params: IdParams, response: { 200: EvalSuiteRunSummary } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return suiteRuns.cancel(workspaceId, req.params.id);
    },
  );

  // ---- overview --------------------------------------------------------------

  app.get('/eval/overview', { schema: { response: { 200: EvalOverview } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.overview(workspaceId);
  });

  app.post('/eval/run-all', { schema: { response: { 202: RunAllResponse } } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    return reply.code(202).send(await suiteRuns.runAll(workspaceId));
  });
}
