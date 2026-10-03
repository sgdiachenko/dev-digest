/** Pure helpers for the Files-changed navigation target carried in the URL
 *  (`?tab=diff&file=<path>&line=<n>`). The URL is attacker-controllable, so
 *  `file` is only ever matched against the PR's own changed files and `line`
 *  is accepted only as a positive integer. */

export interface FileTarget {
  path: string;
  /** Positive integer, or null when absent/invalid (target the file only). */
  line: number | null;
  /** Changes whenever the target changes — drives apply-once in the diff. */
  key: string;
  /** False when `path` is not among the PR's changed files. */
  inPr: boolean;
}

interface ParamReader {
  get(name: string): string | null;
}

/** A positive safe integer from a URL value; anything else → null. */
export function parseLine(raw: string | null): number | null {
  if (raw == null || !/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** The navigation target in `search`, or null when the Files tab isn't asked
 *  for a file. Never throws on malformed input. */
export function parseFileTarget(search: ParamReader, changedFiles: readonly string[]): FileTarget | null {
  if (search.get("tab") !== "diff") return null;
  const path = search.get("file");
  if (!path) return null;
  const line = parseLine(search.get("line"));
  return { path, line, key: `${path}#${line ?? ""}`, inPr: changedFiles.includes(path) };
}

/** URL of the PR page opened on the Files tab at `path` (and `line`), keeping
 *  every other query param (e.g. `trace`). */
export function buildDiffHref(
  repoId: string,
  number: string,
  current: URLSearchParams,
  path: string,
  line: number | null,
): string {
  const sp = new URLSearchParams(current.toString());
  sp.set("tab", "diff");
  sp.set("file", path);
  if (line != null && line >= 1) sp.set("line", String(line));
  else sp.delete("line");
  return `/repos/${repoId}/pulls/${number}?${sp.toString()}`;
}

/** A copy of `current` without the navigation target params. */
export function withoutTarget(current: URLSearchParams): URLSearchParams {
  const sp = new URLSearchParams(current.toString());
  sp.delete("file");
  sp.delete("line");
  return sp;
}
