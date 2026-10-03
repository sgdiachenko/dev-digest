import { describe, it, expect } from 'vitest';
import { RepoService } from '../src/modules/repos/service.js';
import type { RepoRepository } from '../src/modules/repos/repository.js';
import type { JobRunner } from '../src/platform/jobs.js';
import { MockGitClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { CONTEXT_SCAN_JOB_KIND } from '../src/modules/project-context/constants.js';
import { INDEX_JOB_KIND } from '../src/modules/repo-intel/constants.js';

function setup(opts: { failKinds?: string[] } = {}) {
  const calls: string[] = [];
  const enqueued: { kind: string; payload: unknown }[] = [];
  const repo = {
    updateClonePath: async () => void calls.push('updateClonePath'),
    workspaceIdFor: async () => 'w1',
  } as unknown as RepoRepository;
  const jobs = {
    register: () => {},
    enqueue: async (_ws: string, kind: string, payload: unknown) => {
      calls.push(`enqueue:${kind}`);
      if (opts.failKinds?.includes(kind)) throw new Error('no handler');
      enqueued.push({ kind, payload });
      return { id: 'j', done: Promise.resolve() };
    },
  } as unknown as JobRunner;
  const service = new RepoService(repo, jobs, new MockGitClient({}), new MockSecretsProvider({}));
  return { service, calls, enqueued };
}

const payload = { repoId: 'r1', owner: 'acme', name: 'app', url: 'https://github.com/acme/app.git' };

describe('RepoService.runCloneJob -> project-context scan', () => {
  it('enqueues CONTEXT_SCAN_JOB_KIND with {repoId} after updateClonePath', async () => {
    const { service, calls, enqueued } = setup();
    await service.runCloneJob(payload);
    expect(enqueued).toContainEqual({ kind: CONTEXT_SCAN_JOB_KIND, payload: { repoId: 'r1' } });
    expect(calls.indexOf('updateClonePath')).toBeLessThan(calls.indexOf(`enqueue:${CONTEXT_SCAN_JOB_KIND}`));
  });

  it('an enqueue failure does not fail the clone job', async () => {
    const { service } = setup({ failKinds: [CONTEXT_SCAN_JOB_KIND] });
    await expect(service.runCloneJob(payload)).resolves.toBeUndefined();
  });

  it('a failed index enqueue does not stop the catalog enqueue', async () => {
    const { service, enqueued } = setup({ failKinds: [INDEX_JOB_KIND] });
    await service.runCloneJob(payload);
    expect(enqueued.map((e) => e.kind)).toEqual([CONTEXT_SCAN_JOB_KIND]);
  });
});
