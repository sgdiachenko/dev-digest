/**
 * Input shapes of the pure facts builder. Everything here is a local structural
 * copy: `facts/` never imports repo-intel or git runtime code (see the
 * `pure-folders-are-pure` dependency-cruiser rule). The service maps real
 * `GitTreeEntry` / `GraphFacts` / `GitGrepMatch` values into these.
 */

/** One blob of the git tree at `source_sha` (no trees, no gitlinks). */
export interface TourTreeFile {
  path: string;
  oid: string;
  /** Byte size; null when git reported none. */
  size: number | null;
}

/** A file the service read from a git object (UTF-8 text, within the caps). */
export interface TourReadFile {
  path: string;
  text: string;
}

/** Local structural copy of repo-intel's `GraphFacts`. */
export interface TourGraph {
  edges: Array<{ from: string; to: string }>;
  ranks: Array<{ path: string; rank: number }>;
  fileFacts: Array<{ path: string; endpoints: string[]; crons: string[] }>;
}

export interface TourGrepMatch {
  path: string;
  /** 1-based. */
  line: number;
}

/** `git grep` hits at `source_sha`, already collected by the service. */
export interface TourGrepHits {
  /** `TODO` / `FIXME` comments. */
  todo: TourGrepMatch[];
  /** Files that declare `package main` (Go). */
  goMain: TourGrepMatch[];
  /** Files annotated `@SpringBootApplication`. */
  springApp: TourGrepMatch[];
}

export interface TourInput {
  sourceSha: string;
  tree: TourTreeFile[];
  files: TourReadFile[];
  graph: TourGraph;
  grep: TourGrepHits;
  /** Files the service skipped while reading (size cap, count cap, read error). */
  skipped: number;
}

export type TourPhase = 'install' | 'environment' | 'infrastructure' | 'dev' | 'test';
