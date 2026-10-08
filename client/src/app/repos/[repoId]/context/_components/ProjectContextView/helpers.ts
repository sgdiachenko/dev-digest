import type { ContextCategory, ContextDoc } from "@/lib/types";
import { CATEGORIES, MAX_PATH_CHARS } from "./constants";

export interface ViewState {
  q: string;
  cats: ContextCategory[];
  doc: string | null;
}

/** Read the filter/selection state from search params (`q`, `cat`, `doc`); unknown categories are dropped. */
export function parseViewState(search: { get(name: string): string | null }): ViewState {
  const wanted = new Set((search.get("cat") ?? "").split(",").filter(Boolean));
  return {
    q: search.get("q") ?? "",
    cats: CATEGORIES.filter((c) => wanted.has(c)),
    doc: search.get("doc") || null,
  };
}

/** Inverse of `parseViewState`: query string without the leading `?` (empty when nothing is set). */
export function toSearch(state: ViewState): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (state.cats.length > 0) sp.set("cat", state.cats.join(","));
  if (state.doc) sp.set("doc", state.doc);
  return sp.toString();
}

/** Case-insensitive path substring match AND selected categories (empty set = all). Keeps server order. */
export function filterDocs(files: ContextDoc[], q: string, cats: ContextCategory[]): ContextDoc[] {
  const needle = q.trim().toLowerCase();
  return files.filter(
    (f) =>
      (cats.length === 0 || cats.includes(f.category)) &&
      (needle === "" || f.path.toLowerCase().includes(needle)),
  );
}

/** True when there are documents but the current filters hide all of them. */
export function isNoMatch(files: ContextDoc[], filtered: ContextDoc[]): boolean {
  return files.length > 0 && filtered.length === 0;
}

/** Elide the middle of a long path so both the directory and the file name stay visible. */
export function truncateMiddle(path: string, max: number = MAX_PATH_CHARS): string {
  if (path.length <= max) return path;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return `${path.slice(0, head)}…${path.slice(path.length - tail)}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "less than a minute ago";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "";
}
