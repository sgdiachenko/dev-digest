import type { ContextCategory } from "@/lib/types";

/** Category chips, in display order. */
export const CATEGORIES: readonly ContextCategory[] = ["specs", "docs", "insights"];

export const SKELETON_ROWS = 8;

/** Visible path length before the middle is elided (full path stays in title/aria-label). */
export const MAX_PATH_CHARS = 120;

/** Catalog poll interval while the server reports `scanning` (mirrors hooks/context.ts). */
export const POLL_MS = 1500;
