import { z } from 'zod';

// ---- Project Context catalog (markdown documents of a repo, read from git objects) ----
export const ContextCategory = z.enum(['specs', 'docs', 'insights']);
export type ContextCategory = z.infer<typeof ContextCategory>;

export const ContextDocStatus = z.enum(['ok', 'empty', 'too_large', 'unreadable']);
export type ContextDocStatus = z.infer<typeof ContextDocStatus>;

export const ContextCatalogStatus = z.enum(['ready', 'not_cloned', 'scanning', 'error']);
export type ContextCatalogStatus = z.infer<typeof ContextCatalogStatus>;

export const ContextUsageRef = z.object({
  id: z.string(),
  name: z.string(),
});
export type ContextUsageRef = z.infer<typeof ContextUsageRef>;

export const ContextDocUsage = z.object({
  agents: z.array(ContextUsageRef),
  skills: z.array(ContextUsageRef),
});
export type ContextDocUsage = z.infer<typeof ContextDocUsage>;

export const ContextDoc = z.object({
  path: z.string(),
  category: ContextCategory,
  size: z.number().int().min(0),
  /** Tokenizer estimate; null when the document was not read (too_large / unreadable). */
  est_tokens: z.number().int().min(0).nullable(),
  status: ContextDocStatus,
  secret_warning: z.boolean(),
  /** Agents/skills that attach this document; always null until attachments ship. */
  used_by: ContextDocUsage.nullable(),
});
export type ContextDoc = z.infer<typeof ContextDoc>;

export const ContextCatalog = z.object({
  repo_id: z.string(),
  status: ContextCatalogStatus,
  branch: z.string().nullable(),
  scanned_sha: z.string().nullable(),
  /** ISO timestamp of the last successful scan. */
  scanned_at: z.string().nullable(),
  total_files: z.number().int().min(0),
  truncated: z.boolean(),
  error: z.string().nullable(),
  files: z.array(ContextDoc),
});
export type ContextCatalog = z.infer<typeof ContextCatalog>;

export const ContextDocContent = ContextDoc.omit({ used_by: true }).extend({
  sha: z.string(),
  content: z.string().nullable(),
});
export type ContextDocContent = z.infer<typeof ContextDocContent>;

/** Query for GET /repos/:id/context/file — `path` is only compared against the catalog. */
export const ContextFileQuery = z.object({
  path: z.string().min(1).max(4096),
});
export type ContextFileQuery = z.infer<typeof ContextFileQuery>;

/** 202 body for POST /repos/:id/context/rescan. */
export const ContextRescanAccepted = z.object({
  status: z.literal('accepted'),
  catalog_status: ContextCatalogStatus,
});
export type ContextRescanAccepted = z.infer<typeof ContextRescanAccepted>;
