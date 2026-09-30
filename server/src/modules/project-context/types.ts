/**
 * project-context ports and domain types.
 *
 *   - `ProjectContextCatalog` — read port other modules (attachments, later)
 *     take from `container.projectContext`.
 *   - `ProjectContextStore`   — persistence port implemented by repository.ts.
 */
import type { ContextCatalog, ContextCategory, ContextDocContent, ContextDocStatus } from '@devdigest/shared';

/** pino-compatible subset the scan logs through. Never receives document content. */
export interface ScanLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

export interface ProjectContextCatalog {
  getCatalog(workspaceId: string, repoId: string, logger?: ScanLogger): Promise<ContextCatalog>;
  readDoc(workspaceId: string, repoId: string, path: string): Promise<ContextDocContent>;
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
