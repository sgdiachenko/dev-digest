/** Constants for the skills module. */

/** Initial config version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Hard cap on a skill body — keeps one rogue import from blowing the prompt
 *  token budget or the DB row size. */
export const MAX_SKILL_BODY_CHARS = 20_000;

/** Cap on an import upload (post-base64-decode byte length). The app-wide
 *  Fastify `bodyLimit` is 1 MB and base64 inflates ~33%, so this stays well
 *  under that with room for the JSON envelope. */
export const MAX_IMPORT_BYTES = 500_000;

/** Findings/runs window for the Stats tab's "(30D)" tiles. */
export const STATS_WINDOW_DAYS = 30;

/** Default skill type when an import can't infer one. */
export const DEFAULT_SKILL_TYPE = 'custom' as const;

/** Default restore note when the caller doesn't supply one. */
export const RESTORE_NOTE_PREFIX = 'Restored v';
