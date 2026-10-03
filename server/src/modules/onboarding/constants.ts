/** Distinct (repo, index version) fact sets kept in memory. */
export const TOUR_CACHE_MAX = 32;

/** `git grep` inputs for the facts the tree alone cannot give (patterns travel via `-e`). */
export const TODO_PATTERNS: readonly string[] = ['TODO', 'FIXME'];
export const GO_MAIN_PATTERNS: readonly string[] = ['^package main'];
export const SPRING_APP_PATTERNS: readonly string[] = ['@SpringBootApplication'];

export const GO_PATHSPECS: readonly string[] = ['*.go'];
export const SPRING_PATHSPECS: readonly string[] = ['*.java', '*.kt'];

export const GREP_MAX_RESULTS = 500;
export const GREP_MAX_PER_FILE = 3;
