/**
 * project-context ports and domain types.
 *
 *   - `ProjectContextCatalog` — read port other modules (attachments, later)
 *     take from `container.projectContext`.
 *   - `ProjectContextStore`   — persistence port implemented by repository.ts.
 */
import type {
  AttachedDocStatus,
  ContextCatalog,
  ContextCategory,
  ContextDocContent,
  ContextDocStatus,
} from '@devdigest/shared';

/** pino-compatible subset the scan logs through. Never receives document content. */
export interface ScanLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

export interface ProjectContextCatalog {
  getCatalog(workspaceId: string, repoId: string, logger?: ScanLogger): Promise<ContextCatalog>;
  readDoc(workspaceId: string, repoId: string, path: string): Promise<ContextDocContent>;
  /**
   * The named documents' text, read from git objects at the catalog's `scanned_sha`, in the
   * order of `paths`. Throws `ContextUnavailableError` when there is nothing to read from.
   */
  resolveDocs(workspaceId: string, repoId: string, paths: string[]): Promise<ResolvedDocs>;
}

/** One requested document as resolved against the catalog. `text` is set for `ok` and `empty` only. */
export interface ResolvedDoc {
  path: string;
  /** null when the path is not in the catalog. */
  category: ContextCategory | null;
  status: AttachedDocStatus;
  text: string | null;
  /** The catalog's estimate; null when the document was not read (or is missing). */
  estTokens: number | null;
  secretWarning: boolean;
}

export interface ResolvedDocs {
  sha: string;
  branch: string;
  docs: ResolvedDoc[];
}

/** The catalog cannot serve documents right now; callers degrade instead of failing. */
export class ContextUnavailableError extends Error {
  constructor(public readonly reason: 'no_clone' | 'no_catalog') {
    super(`project context unavailable: ${reason}`);
    this.name = 'ContextUnavailableError';
  }
}

/** Direct attachments of one document: agents and skills that pin it. */
export interface DocUsage {
  agents: { id: string; name: string }[];
  skills: { id: string; name: string }[];
}

export interface ContextRepo {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

export interface CatalogState {
  repoId: string;
  status: 'scanning' | 'ready' | 'error';
  branch: string | null;
  scannedSha: string | null;
  scannedAt: Date | null;
  scanStartedAt: Date | null;
  totalFiles: number;
  truncated: boolean;
  error: string | null;
}

export interface CatalogDoc {
  path: string;
  category: ContextCategory;
  size: number;
  estTokens: number | null;
  status: ContextDocStatus;
  secretWarning: boolean;
  blobOid: string;
}

export interface ReplaceCatalogInput {
  repoId: string;
  workspaceId: string;
  branch: string;
  scannedSha: string;
  scannedAt: Date;
  totalFiles: number;
  truncated: boolean;
  docs: CatalogDoc[];
}

export interface ProjectContextStore {
  /** Workspace-scoped lookup (tenancy guard for HTTP callers). */
  getRepo(workspaceId: string, repoId: string): Promise<ContextRepo | null>;
  /** Unscoped lookup for the job handler, which already trusts its payload. */
  getRepoById(repoId: string): Promise<ContextRepo | null>;
  getCatalogState(repoId: string): Promise<CatalogState | null>;
  /** Ordered by path. */
  listDocs(repoId: string): Promise<CatalogDoc[]>;
  getDoc(repoId: string, path: string): Promise<CatalogDoc | null>;
  /** Catalog rows for the given paths (unknown paths are simply absent); order unspecified. */
  getDocs(repoId: string, paths: string[]): Promise<CatalogDoc[]>;
  /** Direct agent / skill attachments of the repo's documents, keyed by path. */
  listUsage(repoId: string): Promise<Map<string, DocUsage>>;
  markScanning(repoId: string, workspaceId: string, startedAt: Date): Promise<void>;
  /** Replaces the catalog row and every doc of the repo atomically. */
  replaceCatalog(input: ReplaceCatalogInput): Promise<void>;
  /** Records a failed scan; leaves existing docs untouched. */
  markError(repoId: string, workspaceId: string, reason: string): Promise<void>;
}

/** The slice of JobRunner this module uses. */
export interface ContextJobs {
  register(kind: string, handler: (payload: unknown) => Promise<void>): void;
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<{ id: string }>;
}
