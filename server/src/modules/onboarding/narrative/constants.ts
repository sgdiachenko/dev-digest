/** Limits for the AI onboarding narrative. Pure: no imports. */
export const MAX_INPUT_TOKENS = 12000;
export const MAX_EXCERPTS = 20;
export const MAX_EXCERPT_BYTES = 8192;
export const NARRATIVE_MAX_TOKENS = 8000;
export const NARRATIVE_TIMEOUT_MS = 60000;
export const INTERRUPTED_AFTER_MS = 90000;
export const RATE_LIMIT = { max: 10, windowMs: 60000 } as const;
export const MAX_ARCH_BODY = 1500;
export const MAX_DESC = 140;
export const MAX_TASK_TITLE = 80;
export const MAX_DIAGRAM_NODES = 20;
export const ESTIMATE_INPUT_TOKENS = 12000;
