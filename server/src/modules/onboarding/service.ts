/**
 * OnboardingService — serves the deterministic onboarding tour of a repo.
 *
 * Repository content is read only from git objects at the indexed SHA
 * (`listTree` + `readBlob` + `grepAt`) and is never executed. All I/O lives
 * here; `facts/` is pure. Takes narrow ports, not the container; the instance
 * is memoized in the container so the facts cache and single-flight map are
 * shared by every caller.
 *
 * Only `TourFacts` are cached. The narrative overlay is asked on every request
 * (`getTour`) and never stored here.
 */
import type {
  GitGrepMatch,
  GitTreeEntry,
  Onboarding,
  OnboardingAvailability,
  RepoRef,
} from '@devdigest/shared';
import { BlobTooLargeError } from '../../adapters/git/show-file-at-guard.js';
import { NotFoundError } from '../../platform/errors.js';
import type { IndexState } from '../repo-intel/types.js';
import { decideAvailability, toIndexInfo, type TourIndexState } from './facts/availability.js';
import { MAX_FILE_BYTES } from './facts/constants.js';
import { comparePath } from './facts/paths.js';
import { buildTourFacts } from './facts/tour.js';
import { selectFilesToRead } from './facts/manifests.js';
import type { TourGraph, TourReadFile } from './facts/types.js';
import {
  GO_MAIN_PATTERNS,
  GO_PATHSPECS,
  GREP_MAX_PER_FILE,
  GREP_MAX_RESULTS,
  SPRING_APP_PATTERNS,
  SPRING_PATHSPECS,
  TODO_PATTERNS,
  TOUR_CACHE_MAX,
} from './constants.js';
import type {
  TourFacts,
  TourGit,
  TourIndex,
  TourLogger,
  TourOverlay,
  TourRepo,
  TourRepoStore,
  TourTreeIndexEntry,
} from './types.js';

/** Overlay used until the narrative is wired: no narrative, no estimate. */
export const NULL_OVERLAY: TourOverlay = {
  forTour: async () => ({ narrative: null, estimated_cost: null }),
};

const REASON_MAX_CHARS = 200;
const errorReason = (err: unknown): string =>
  (err instanceof Error ? err.name : 'error').slice(0, REASON_MAX_CHARS);

const decoder = new TextDecoder('utf-8', { fatal: true });

export class OnboardingService {
  /** LRU of available fact sets; Map iteration order = recency. */
  private readonly cache = new Map<string, TourFacts>();
  private readonly inFlight = new Map<string, Promise<TourFacts>>();

  constructor(
    private readonly store: TourRepoStore,
    private readonly index: TourIndex,
    private readonly git: TourGit,
    private readonly overlay: TourOverlay = NULL_OVERLAY,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getTour(workspaceId: string, repoId: string, logger?: TourLogger): Promise<Onboarding> {
    const facts = await this.getFacts(workspaceId, repoId, logger);
    // Asked on every request and never cached: the narrative changes independently of the facts.
    const { narrative, estimated_cost } = await this.overlay.forTour(workspaceId, repoId, facts.source_sha);
    return {
      repo_id: facts.repoId,
      availability: facts.availability,
      source_sha: facts.source_sha,
      computed_at: facts.computed_at,
      index: facts.index,
      sections: facts.sections,
      narrative,
      estimated_cost,
    };
  }

  async getFacts(workspaceId: string, repoId: string, logger?: TourLogger): Promise<TourFacts> {
    const repo = await this.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) return this.unavailable(repo, 'not_cloned', null);

    const state = this.toIndexState(await this.index.getIndexState(repo.id));
    if (decideAvailability({ hasClone: true, index: state, treeReadable: true }) !== 'available') {
      return this.unavailable(repo, 'not_indexed', state);
    }

    // The index version (sha + completion time) is the cache key: a reindex of the same sha
    // can change the graph, so it must not be served from a stale entry.
    const key = `${repo.id}:${state!.lastIndexedSha}:${state!.version}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const run = this.compute(repo, state!, key, logger).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  private async compute(
    repo: TourRepo,
    state: TourIndexState & { version: number },
    key: string,
    logger?: TourLogger,
  ): Promise<TourFacts> {
    const startedAt = this.now().getTime();
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const sha = state.lastIndexedSha;

    let entries: GitTreeEntry[];
    try {
      entries = await this.git.listTree(ref, sha);
    } catch (err) {
      logger?.warn({ repoId: repo.id, sha, reason: errorReason(err) }, 'tour: tree unreadable');
      return this.unavailable(repo, 'not_indexed', state);
    }

    const blobs = entries.filter((e) => e.type === 'blob');
    const tree = blobs
      .map((e) => ({ path: e.path, oid: e.oid, size: e.size }))
      .sort((a, b) => comparePath(a.path, b.path));
    const treeIndex = new Map<string, TourTreeIndexEntry>(
      [...entries]
        .sort((a, b) => comparePath(a.path, b.path))
        .map((e) => [e.path, { oid: e.oid, size: e.size, kind: e.type }]),
    );

    const graphFacts = await this.index.getGraphFacts(repo.id);
    const graph: TourGraph = {
      edges: graphFacts.edges,
      ranks: graphFacts.ranks,
      fileFacts: graphFacts.fileFacts,
    };

    const selection = selectFilesToRead(tree);
    let skipped = selection.skipped;
    const files: TourReadFile[] = [];
    for (const file of selection.files) {
      try {
        const bytes = await this.git.readBlob(ref, file.oid, MAX_FILE_BYTES);
        files.push({ path: file.path, text: decoder.decode(bytes) });
      } catch (err) {
        // Over the cap, unreadable or not UTF-8: skip and count, never fail the tour.
        skipped += 1;
        if (!(err instanceof BlobTooLargeError)) {
          logger?.warn({ repoId: repo.id, sha, reason: errorReason(err) }, 'tour: file skipped');
        }
      }
    }

    const grep = async (patterns: readonly string[], pathspecs: readonly string[] = []): Promise<GitGrepMatch[]> => {
      try {
        return await this.git.grepAt(ref, sha, [...patterns], {
          ...(pathspecs.length > 0 ? { pathspecs: [...pathspecs] } : {}),
          maxPerFile: GREP_MAX_PER_FILE,
          maxResults: GREP_MAX_RESULTS,
        });
      } catch (err) {
        skipped += 1;
        logger?.warn({ repoId: repo.id, sha, reason: errorReason(err) }, 'tour: grep failed');
        return [];
      }
    };
    const [todo, goMain, springApp] = await Promise.all([
      grep(TODO_PATTERNS),
      grep(GO_MAIN_PATTERNS, GO_PATHSPECS),
      grep(SPRING_APP_PATTERNS, SPRING_PATHSPECS),
    ]);

    const built = buildTourFacts({ sourceSha: sha, tree, files, graph, grep: { todo, goMain, springApp }, skipped });
    const graphAvailable = graph.edges.length > 0 || graph.ranks.length > 0;
    const facts: TourFacts = {
      repoId: repo.id,
      index: toIndexInfo({ index: state, filesInRepo: blobs.length, graphAvailable, skipped: built.skipped }),
      availability: 'available',
      source_sha: sha,
      computed_at: this.now().toISOString(),
      sections: built.sections,
      treeIndex,
    };

    this.cache.set(key, facts);
    while (this.cache.size > TOUR_CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    logger?.info(
      {
        repoId: repo.id,
        sha,
        durationMs: this.now().getTime() - startedAt,
        filesInRepo: blobs.length,
        filesRead: files.length,
        skipped: built.skipped,
        graphAvailable,
        // Counts and reasons only — never section contents.
        sectionCounts: {
          modules: built.sections.architecture.modules.length,
          critical_paths: built.sections.critical_paths.items.length,
          run_locally_commands: built.sections.run_locally.groups.reduce((n, g) => n + g.commands.length, 0),
          reading_path: built.sections.reading_path.items.length,
          first_tasks: built.sections.first_tasks.items.length,
        },
        indexStatus: facts.index.status,
        degradationReason: facts.index.status === 'full' ? null : facts.index.reason,
        availability: facts.availability,
      },
      'tour: facts built',
    );
    return facts;
  }

  /** Never cached: availability can flip as soon as the clone or index appears. */
  private unavailable(
    repo: TourRepo,
    availability: Exclude<OnboardingAvailability, 'available'>,
    state: TourIndexState | null,
  ): TourFacts {
    return {
      repoId: repo.id,
      index: toIndexInfo({ index: state, filesInRepo: null, graphAvailable: false, skipped: 0 }),
      availability,
      source_sha: null,
      computed_at: this.now().toISOString(),
      sections: null,
      treeIndex: new Map(),
    };
  }

  /** null when the repo was never indexed (`lastIndexedSha === ''`). */
  private toIndexState(s: IndexState): (TourIndexState & { version: number }) | null {
    if (!s.lastIndexedSha) return null;
    return {
      lastIndexedSha: s.lastIndexedSha,
      status: s.status,
      reason: s.reason ?? null,
      filesIndexed: s.filesIndexed,
      version: s.updatedAt instanceof Date ? s.updatedAt.getTime() : 0,
    };
  }
}
