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
  /** Agents/skills that attach this document; null when usage is unavailable (no catalog / not cloned). */
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

// ---- Attachments (agent / skill ↔ catalog documents) ----
export const AttachedDocStatus = z.enum(['ok', 'empty', 'missing', 'too_large', 'unreadable']);
export type AttachedDocStatus = z.infer<typeof AttachedDocStatus>;

export const ContextAttachmentRef = z
  .object({
    repo_id: z.string().uuid(),
    path: z.string().min(1).max(4096),
  })
  .strict();
export type ContextAttachmentRef = z.infer<typeof ContextAttachmentRef>;

/** PUT body for an agent's / skill's attachments — the full ordered list across all repos. */
export const ContextAttachmentsBody = z
  .object({
    docs: z.array(ContextAttachmentRef).max(20),
  })
  .strict();
export type ContextAttachmentsBody = z.infer<typeof ContextAttachmentsBody>;

/** Query for GET .../context — the repo whose budget/estimates the view is computed for. */
export const ContextViewQuery = z.object({
  repo_id: z.string().uuid(),
});
export type ContextViewQuery = z.infer<typeof ContextViewQuery>;

export const AttachedDoc = z.object({
  repo_id: z.string().uuid(),
  path: z.string(),
  position: z.number().int().min(0),
  /** null when the document is no longer in the catalog. */
  category: ContextCategory.nullable(),
  est_tokens: z.number().int().min(0).nullable(),
  status: AttachedDocStatus,
  /** Set when injection would drop this document because the budget is exceeded. */
  would_skip: z.literal('over_budget').nullable(),
});
export type AttachedDoc = z.infer<typeof AttachedDoc>;

export const InheritedDoc = AttachedDoc.extend({
  skill_id: z.string(),
  skill_name: z.string(),
  skill_active: z.boolean(),
  /** Why the linked skill is not injected; null while it is active. */
  skill_inactive_reason: z.enum(['disabled', 'unsafe']).nullable(),
  /** True when the same document is already attached directly or by an earlier skill. */
  duplicate: z.boolean(),
});
export type InheritedDoc = z.infer<typeof InheritedDoc>;

export const AgentContextView = z.object({
  repo_id: z.string().uuid(),
  budget_tokens: z.number().int().min(0),
  total_est_tokens: z.number().int().min(0),
  over_budget: z.boolean(),
  own: z.array(AttachedDoc),
  inherited: z.array(InheritedDoc),
});
export type AgentContextView = z.infer<typeof AgentContextView>;

export const SkillContextView = z.object({
  repo_id: z.string().uuid(),
  budget_tokens: z.number().int().min(0),
  total_est_tokens: z.number().int().min(0),
  over_budget: z.boolean(),
  own: z.array(AttachedDoc),
  /** The block exactly as it would be injected for this skill's documents. */
  serialized: z.string(),
  serialized_est_tokens: z.number().int().min(0),
});
export type SkillContextView = z.infer<typeof SkillContextView>;
