/** Pure helpers for the Smart Diff view (DiffTab). */
import type { FindingRecord, PrFile, SmartDiff, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";

/** D7 — Smart order groups files by role; Original order is the flat,
 *  unmodified `pr.files` list (GitHub's own order). */
export type DiffOrder = "smart" | "original";

export interface ResolvedGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Resolve the Smart Diff's per-role file lists into the actual `PrFile`s
 * (with patch text) — the smart-diff response only carries path/additions/
 * deletions/finding_ids. Files within a group are re-sorted to match `prFiles`'
 * original GitHub order (D6); a `prFiles` path the smart-diff response never
 * classified (a stale response racing a new commit) still shows up, appended
 * to `core` (D10).
 */
export function orderFilesByRole(groups: SmartDiffGroup[], prFiles: PrFile[]): ResolvedGroup[] {
  const byPath = new Map(prFiles.map((f) => [f.path, f]));
  const indexByPath = new Map(prFiles.map((f, i) => [f.path, i]));
  const covered = new Set<string>();

  const resolved: ResolvedGroup[] = groups.map((g) => ({
    role: g.role,
    files: [...g.files]
      .sort(
        (a, b) =>
          (indexByPath.get(a.path) ?? Number.MAX_SAFE_INTEGER) -
          (indexByPath.get(b.path) ?? Number.MAX_SAFE_INTEGER),
      )
      .map((f) => {
        covered.add(f.path);
        return byPath.get(f.path) ?? { path: f.path, additions: f.additions, deletions: f.deletions, patch: null };
      }),
  }));

  const missing = prFiles.filter((f) => !covered.has(f.path));
  if (missing.length > 0) {
    const core = resolved.find((g) => g.role === "core");
    if (core) core.files.push(...missing);
    else resolved.unshift({ role: "core", files: missing });
  }

  return resolved;
}

/**
 * The subset of a PR's loaded findings (from `usePrReviews`) that belong to
 * the Smart Diff's kept `finding_ids` (D4) — so the group/file dots (driven
 * by the smart-diff response) and the finding cards actually rendered always
 * agree, and a dismissed/deleted finding disappears from both at once.
 */
export function findingsForSmartDiff(smartDiff: SmartDiff, findings: FindingRecord[]): FindingRecord[] {
  const ids = new Set<string>();
  for (const g of smartDiff.groups) for (const f of g.files) for (const id of f.finding_ids) ids.add(id);
  return findings.filter((f) => ids.has(f.id));
}

export interface DiffTotals {
  files: number;
  additions: number;
  deletions: number;
}

/** Total files/additions/deletions across a flat file list — independent of
 *  Smart/Original grouping, so the header stays correct in both. */
export function diffTotals(files: { additions: number; deletions: number }[]): DiffTotals {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions;
    deletions += f.deletions;
  }
  return { files: files.length, additions, deletions };
}
