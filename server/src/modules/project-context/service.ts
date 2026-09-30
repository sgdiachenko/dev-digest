/**
 * ProjectContextService — builds and serves the catalog of a repo's Markdown
 * documents. Documents are read only from git objects at a fixed sha
 * (`listTree` + `readBlob`), never from the working tree, and never sent to an
 * LLM (no LLM port here by construction).
 *
 * Takes ports, not the container. The instance is memoized in the container:
 * the single-flight `inFlight` map only works if every caller shares it.
 */
import type {
  ContextCatalog,
  ContextDocContent,
  ContextRescanAccepted,
  GitClient,
  RepoRef,
  Tokenizer,
} from '@devdigest/shared';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { REFRESH_JOB_KIND } from '../repo-intel/constants.js';
import {
  CONTEXT_SCAN_JOB_KIND,
  MAX_DOC_BYTES,
  SCAN_YIELD_EVERY,
  STALE_SCAN_MS,
} from './constants.js';
import { categorize, classifyDoc, compareByPath, decodeUtf8Strict, selectEntries } from './helpers.js';
import type {
  CatalogDoc,
  CatalogState,
  ContextJobs,
  ContextRepo,
  ProjectContextCatalog,
  ProjectContextStore,
  ScanLogger,
} from './types.js';

interface ScanOptions {
  sync: boolean;
  logger?: ScanLogger;
}

const REASON_MAX_CHARS = 200;

const errorReason = (prefix: string, err: unknown): string =>
  `${prefix}:${err instanceof Error ? err.message : String(err)}`.slice(0, REASON_MAX_CHARS);

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export class ProjectContextService implements ProjectContextCatalog {
  private readonly inFlight = new Map<string, Promise<void>>();
  /** Repos whose running scan already fetches (`sync: true`). */
  private readonly syncing = new Set<string>();

  constructor(
    private readonly store: ProjectContextStore,
    private readonly git: GitClient,
    private readonly tokenizer: Tokenizer,
    private readonly jobs: ContextJobs,
  ) {}

  async getCatalog(
    workspaceId: string,
    repoId: string,
    logger?: ScanLogger,
  ): Promise<ContextCatalog> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) return this.toCatalog(repo.id, null, [], 'not_cloned');

    let state = await this.store.getCatalogState(repo.id);
    if (!state) {
      // First open of a cloned repo: build from the current HEAD, don't wait.
      void this.scan(repo, { sync: false, logger });
      return this.toCatalog(repo.id, null, [], 'scanning');
    }
    if (state.status === 'scanning' && this.isStale(repo.id, state)) {
      // Pool connections answer out of order: the row read above may predate a scan that has
      // since committed. Re-read once the scan is out of `inFlight` before declaring it dead.
      const fresh = (await this.store.getCatalogState(repo.id)) ?? state;
      if (fresh.status === 'scanning' && this.isStale(repo.id, fresh)) {
        await this.store.markError(repo.id, repo.workspaceId, 'scan_interrupted');
        state = { ...fresh, status: 'error', error: 'scan_interrupted', scanStartedAt: null };
      } else {
        state = fresh;
      }
    }
    const docs = (await this.store.listDocs(repo.id)).sort(compareByPath);
    return this.toCatalog(repo.id, state, docs, state.status);
  }

  async readDoc(workspaceId: string, repoId: string, path: string): Promise<ContextDocContent> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const { doc, state } = await this.readDocRow(repo.id, path);
    const branch = state?.branch ?? null;
    const sha = state?.scannedSha ?? null;
    // `path` is only ever compared to the catalog: no git call for an unknown one.
    if (!doc) throw new NotFoundError('Document not found', { reason: 'not_in_catalog', branch, sha });

    const meta = {
      path: doc.path,
      category: doc.category,
      size: doc.size,
      est_tokens: doc.estTokens,
      secret_warning: doc.secretWarning,
      sha: sha ?? '',
    };
    if (doc.status === 'too_large' || doc.status === 'unreadable') {
      return { ...meta, status: doc.status, content: null };
    }
    if (doc.status === 'empty') return { ...meta, status: 'empty', content: '' };

    let bytes: Uint8Array;
    try {
      bytes = await this.git.readBlob(this.refOf(repo), doc.blobOid, MAX_DOC_BYTES);
    } catch {
      throw new NotFoundError('Document not found', { reason: 'commit_unavailable', branch, sha });
    }
    const content = decodeUtf8Strict(bytes);
    return content === null
      ? { ...meta, status: 'unreadable', content: null }
      : { ...meta, status: 'ok', content };
  }

  /**
   * The document row and the catalog state must describe the same scan: a scan that commits
   * between the two reads would pair the new sha with the old row. Re-read once if it moved.
   */
  private async readDocRow(repoId: string, path: string) {
    for (let attempt = 0; ; attempt++) {
      const before = await this.store.getCatalogState(repoId);
      const doc = await this.store.getDoc(repoId, path);
      const after = await this.store.getCatalogState(repoId);
      if (attempt >= 1 || before?.scannedSha === after?.scannedSha) return { doc, state: after };
    }
  }

  async rescan(
    workspaceId: string,
    repoId: string,
    logger?: ScanLogger,
  ): Promise<ContextRescanAccepted> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new ConflictError('not_cloned');
    void this.scan(repo, { sync: true, logger });
    return { status: 'accepted', catalog_status: 'scanning' };
  }

  /** Scan entry for the job runner (after clone / resync); no fetch. */
  async scanForJob(repoId: string, logger: ScanLogger): Promise<void> {
    const repo = await this.store.getRepoById(repoId);
    if (!repo?.clonePath) return;
    await this.scan(repo, { sync: false, logger });
  }

  /** Registered once at plugin load. The handler never throws (no JobRunner retry). */
  registerScanJobHandler(logger: ScanLogger): void {
    this.jobs.register(CONTEXT_SCAN_JOB_KIND, async (payload) => {
      try {
        await this.scanForJob((payload as { repoId: string }).repoId, logger);
      } catch (err) {
        logger.warn({ reason: errorReason('scan_job_failed', err) }, 'project-context: scan job failed');
      }
    });
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<ContextRepo> {
    const repo = await this.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private refOf(repo: ContextRepo): RepoRef {
    return { owner: repo.owner, name: repo.name };
  }

  /** `scanning` without a live scan in this process, or one that outlived the limit. */
  private isStale(repoId: string, state: CatalogState): boolean {
    if (!this.inFlight.has(repoId)) return true;
    return state.scanStartedAt != null && Date.now() - state.scanStartedAt.getTime() > STALE_SCAN_MS;
  }

  private toCatalog(
    repoId: string,
    state: CatalogState | null,
    docs: CatalogDoc[],
    status: ContextCatalog['status'],
  ): ContextCatalog {
    return {
      repo_id: repoId,
      status,
      branch: state?.branch ?? null,
      scanned_sha: state?.scannedSha ?? null,
      scanned_at: state?.scannedAt?.toISOString() ?? null,
      total_files: state?.totalFiles ?? 0,
      truncated: state?.truncated ?? false,
      error: state?.status === 'error' ? state.error : null,
      files: docs.map((d) => ({
        path: d.path,
        category: d.category,
        size: d.size,
        est_tokens: d.estTokens,
        status: d.status,
        secret_warning: d.secretWarning,
        used_by: null,
      })),
    };
  }

  /**
   * Single-flight per repo: a scan already running is joined, not restarted.
   * A syncing request (Rescan) that meets a running no-sync scan is queued to
   * run right after it, so the clone is still advanced (AC-16).
   */
  private scan(repo: ContextRepo, opts: ScanOptions): Promise<void> {
    const running = this.inFlight.get(repo.id);
    if (running) {
      if (!opts.sync || this.syncing.has(repo.id)) return running;
      return running.then(() => this.scan(repo, opts));
    }
    if (opts.sync) this.syncing.add(repo.id);
    const promise = this.runScan(repo, opts).finally(() => {
      this.inFlight.delete(repo.id);
      this.syncing.delete(repo.id);
    });
    this.inFlight.set(repo.id, promise);
    return promise;
  }

  /** Never throws: a failure is persisted as `error` and logged. */
  private async runScan(repo: ContextRepo, { sync, logger }: ScanOptions): Promise<void> {
    const startedAt = Date.now();
    const ref = this.refOf(repo);
    let phase = 'scan_failed';
    try {
      await this.store.markScanning(repo.id, repo.workspaceId, new Date(startedAt));
      phase = 'sync_failed';
      const sha = sync
        ? (await this.git.sync(ref, repo.defaultBranch)).head
        : await this.git.currentHead(ref);
      phase = 'scan_failed';

      const selected = selectEntries(await this.git.listTree(ref, sha));
      const previous = new Map<string, CatalogDoc>();
      for (const d of await this.store.listDocs(repo.id)) {
        if (d.status !== 'unreadable') previous.set(d.blobOid, d);
      }

      const docs: CatalogDoc[] = [];
      let reused = 0;
      let reads = 0;
      let readFailed = 0;
      for (const entry of selected.entries) {
        const size = entry.size ?? 0;
        const prior = previous.get(entry.oid);
        if (prior) {
          // Same blob → same content: keep size/tokens/status/secret flag.
          docs.push({ ...prior, path: entry.path, category: categorize(entry.path) });
          reused += 1;
          continue;
        }
        let bytes: Uint8Array | null = null;
        if (size > 0 && size <= MAX_DOC_BYTES) {
          try {
            bytes = await this.git.readBlob(ref, entry.oid, MAX_DOC_BYTES);
          } catch {
            bytes = null;
            readFailed += 1;
          }
          reads += 1;
          if (reads % SCAN_YIELD_EVERY === 0) await yieldToEventLoop();
        }
        const c = classifyDoc(size, bytes, this.tokenizer);
        docs.push({
          path: entry.path,
          category: categorize(entry.path),
          size,
          estTokens: c.est_tokens,
          status: c.status,
          secretWarning: c.secret_warning,
          blobOid: entry.oid,
        });
      }

      await this.store.replaceCatalog({
        repoId: repo.id,
        workspaceId: repo.workspaceId,
        branch: repo.defaultBranch,
        scannedSha: sha,
        scannedAt: new Date(),
        totalFiles: selected.totalFiles,
        truncated: selected.truncated,
        docs,
      });

      if (sync) await this.enqueueIndexRefresh(repo);
      const count = (s: CatalogDoc['status']) => docs.filter((d) => d.status === s).length;
      logger?.info(
        {
          repoId: repo.id,
          sha,
          entries: docs.length,
          total_files: selected.totalFiles,
          skipped: {
            ...selected.skipped,
            too_large: count('too_large'),
            unreadable: count('unreadable'),
            empty: count('empty'),
            read_failed: readFailed,
          },
          reused,
          durationMs: Date.now() - startedAt,
        },
        'project-context: scan finished',
      );
    } catch (err) {
      const reason = errorReason(phase, err);
      logger?.warn({ repoId: repo.id, reason, durationMs: Date.now() - startedAt }, 'project-context: scan failed');
      await this.store.markError(repo.id, repo.workspaceId, reason).catch(() => {});
    }
  }

  /** Best-effort: a fresh catalog usually follows new code, so refresh repo-intel too. */
  private async enqueueIndexRefresh(repo: ContextRepo): Promise<void> {
    try {
      await this.jobs.enqueue(repo.workspaceId, REFRESH_JOB_KIND, {
        repoId: repo.id,
        owner: repo.owner,
        name: repo.name,
      });
    } catch {
      // no handler / transient enqueue failure — the catalog itself succeeded
    }
  }
}
