/** Section anchors, in page order. `key` is the contract's section key (also the i18n `sections.*` key). */
export const SECTION_IDS = [
  "architecture",
  "critical-paths",
  "run-locally",
  "reading-path",
  "first-tasks",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** Below this viewport width the sticky "On this page" panel becomes a "Jump to" select. */
export const NARROW_BREAKPOINT_PX = 1024;

/** Index-state poll interval while the tour is `not_indexed`. */
export const INDEX_POLL_MS = 1500;
