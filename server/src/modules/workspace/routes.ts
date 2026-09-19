import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { WorkspaceRepository } from './repository.js';

/** Cloned-repo summary for the workspace overview (a projection of `repos`). */
const WorkspaceRepoSummary = z.object({
  id: z.string(),
  full_name: z.string(),
  clone_path: z.string().nullable(),
  last_polled_at: z.string().nullable(),
  cloned: z.boolean(),
});

const WorkspaceInfo = z.object({
  workspaceId: z.string(),
  cloneDir: z.string(),
  repos: z.array(WorkspaceRepoSummary),
});

/**
 * F1 — workspace manager: where clones live + a summary of cloned repos.
 *   GET /workspace        → workspace info + cloneDir + cloned repos summary
 *
 * Cleanup/re-pull of individual repos is handled by the repos module
 * (refresh/delete); this surface gives the UI an overview.
 */
export default async function workspaceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const repo = new WorkspaceRepository(container.db);

  app.get('/workspace', { schema: { response: { 200: WorkspaceInfo } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return {
      workspaceId,
      cloneDir: container.config.cloneDir,
      repos: await repo.listRepos(workspaceId),
    };
  });
}
