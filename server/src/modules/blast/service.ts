/**
 * S3 — Blast radius use case. No repository of its own: `BlastStore` is a
 * subset of `PullsRepository`'s public shape and `BlastIntel` a subset of the
 * repo-intel facade, both declared here by the consumer (onion-architecture:
 * service-takes-ports-not-concrete-repository) — the container's memoized
 * `pullsRepo`/`repoIntel` satisfy them structurally.
 */
import type { BlastRadiusResponse } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';
import { NotFoundError } from '../../platform/errors.js';
import { buildBlastRadius } from './helpers.js';

/**
 * What this service needs from persistence — declared HERE, not imported
 * from `../pulls/repository.js` (onion-architecture: `no-sideways-module-
 * imports`). The container's memoized `pullsRepo` satisfies this
 * structurally — no repository file of this module's own.
 */
export interface BlastStore {
  findPull(workspaceId: string, prId: string): Promise<{ id: string; repoId: string } | undefined>;
  listFiles(prId: string): Promise<{ path: string }[]>;
}

/** The one repo-intel read this use case needs — a narrow slice of `RepoIntel`. */
export interface BlastIntel {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult>;
}

export class BlastService {
  constructor(
    private readonly repo: BlastStore,
    private readonly intel: BlastIntel,
  ) {}

  async getBlast(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const pull = await this.repo.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.repo.listFiles(prId);
    const result = await this.intel.getBlastRadius(
      pull.repoId,
      files.map((f) => f.path),
    );

    return buildBlastRadius(result);
  }
}
