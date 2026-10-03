import type { AttachedDoc, ContextAttachmentRef, ContextCategory, ContextDoc } from "@/lib/types";

/** One row of the attach list: a catalog document, or an attached one that left the catalog (`missing`). */
export interface AttachRowData {
  repo_id: string;
  path: string;
  attached: boolean;
  category: ContextCategory | null;
  est_tokens: number | null;
  status: AttachedDoc["status"];
  would_skip: AttachedDoc["would_skip"];
}

/** Stable row id: repo ids are uuids (no ":"), so the first ":" always splits repo from path. */
export function docKey(ref: { repo_id: string; path: string }): string {
  return `${ref.repo_id}:${ref.path}`;
}

/** Longest path shown in full on a row; longer ones are elided in the middle (full path stays in the name and tooltip). */
export const MAX_ROW_PATH_CHARS = 56;

/** Elide the middle of a long path so the directory start and the file name both stay visible. */
export function truncateMiddle(path: string, max: number = MAX_ROW_PATH_CHARS): string {
  if (path.length <= max) return path;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return `${path.slice(0, head)}…${path.slice(path.length - tail)}`;
}

/** Move the id at `index` up (-1) or down (+1); a no-op at either edge. */
export function moveId(ids: string[], index: number, dir: -1 | 1): string[] {
  const target = index + dir;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Move an id to another id's position (drag & drop). */
export function moveIdTo(ids: string[], sourceId: string, targetId: string): string[] {
  const from = ids.indexOf(sourceId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, sourceId);
  return next;
}

/** Checked appends at the end; unchecked removes wherever it was. */
export function toggleId(ids: string[], id: string, checked: boolean): string[] {
  if (checked) return ids.includes(id) ? ids : [...ids, id];
  return ids.filter((x) => x !== id);
}

/** The selected repo's attachments, in stored order. */
export function ownForRepo<T extends { repo_id: string }>(own: T[], repoId: string): T[] {
  return own.filter((d) => d.repo_id === repoId);
}

/**
 * The full PUT list: other repos' attachments stay exactly as they are, the selected repo's
 * slots are filled from `orderedForRepo` (extra ones are appended, surplus slots dropped).
 */
export function mergeForPut(
  own: ContextAttachmentRef[],
  repoId: string,
  orderedForRepo: ContextAttachmentRef[],
): ContextAttachmentRef[] {
  const merged: ContextAttachmentRef[] = [];
  let next = 0;
  for (const d of own) {
    if (d.repo_id !== repoId) merged.push({ repo_id: d.repo_id, path: d.path });
    else if (next < orderedForRepo.length) merged.push(orderedForRepo[next++]!);
  }
  return merged.concat(orderedForRepo.slice(next));
}

/** Attached rows first (stored order, `missing` ones included), then the rest of the catalog. */
export function rowsFor(catalogFiles: ContextDoc[], own: AttachedDoc[], repoId: string): AttachRowData[] {
  const mine = [...ownForRepo(own, repoId)].sort((a, b) => a.position - b.position);
  const attachedPaths = new Set(mine.map((d) => d.path));
  const attached = mine.map<AttachRowData>((d) => ({
    repo_id: repoId,
    path: d.path,
    attached: true,
    category: d.category,
    est_tokens: d.est_tokens,
    status: d.status,
    would_skip: d.would_skip,
  }));
  const rest = catalogFiles
    .filter((f) => !attachedPaths.has(f.path))
    .map<AttachRowData>((f) => ({
      repo_id: repoId,
      path: f.path,
      attached: false,
      category: f.category,
      est_tokens: f.est_tokens,
      status: f.status,
      would_skip: null,
    }));
  return [...attached, ...rest];
}

/** Rows as the optimistic draft (ordered attached keys) would show them; detached `missing` rows vanish. */
export function applyDraft(rows: AttachRowData[], draftKeys: string[]): AttachRowData[] {
  const byKey = new Map(rows.map((r) => [docKey(r), r]));
  const attached = draftKeys.flatMap((k) => {
    const r = byKey.get(k);
    return r ? [{ ...r, attached: true }] : [];
  });
  const inDraft = new Set(draftKeys);
  const rest = rows
    .filter((r) => !inDraft.has(docKey(r)) && r.status !== "missing")
    .map((r) => ({ ...r, attached: false, would_skip: null }));
  return [...attached, ...rest];
}

/** Ordered refs of the attached rows. */
export function refsOf(rows: AttachRowData[]): ContextAttachmentRef[] {
  return rows.filter((r) => r.attached).map((r) => ({ repo_id: r.repo_id, path: r.path }));
}
