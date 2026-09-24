/**
 * D2/S4 — pure grouping: classify each changed file, attach its kept
 * (non-dismissed) findings, and build the fixed-order Smart Diff groups
 * (D6 — empty groups are omitted; a group's own file order is left as given,
 * the client re-sorts it by `pr.files` index for Original order).
 */
import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { SMART_DIFF_ROLE_ORDER, SPLIT_SUGGESTION_DEFAULT } from './constants.js';

export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

/**
 * Exactly what this module needs from a persisted finding — declared HERE
 * rather than imported from another module's `repository.ts` (onion-
 * architecture: `no-sideways-module-imports`). The real row (`FindingRow`,
 * `db/schema/reviews.ts`) has every one of these fields plus more, so it
 * satisfies this structurally with no cast.
 */
export interface SmartDiffFindingInput {
  id: string;
  file: string;
  startLine: number;
  dismissedAt: Date | null;
}

/** Group a PR's kept findings by file path. Dismissed findings never count
 *  toward a group's `● N` header, a file's dot, or `finding_lines`. */
function findingsByFile(findings: SmartDiffFindingInput[]): Map<string, SmartDiffFindingInput[]> {
  const out = new Map<string, SmartDiffFindingInput[]>();
  for (const f of findings) {
    if (f.dismissedAt != null) continue;
    const list = out.get(f.file) ?? [];
    list.push(f);
    out.set(f.file, list);
  }
  return out;
}

export function buildSmartDiff(files: SmartDiffFileInput[], findings: SmartDiffFindingInput[]): SmartDiff {
  const byFile = findingsByFile(findings);
  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();

  for (const file of files) {
    const role = classifyFile(file.path);
    const kept = (byFile.get(file.path) ?? []).slice().sort((a, b) => a.startLine - b.startLine);
    const smartFile: SmartDiffFile = {
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_ids: kept.map((f) => f.id),
      finding_lines: [...new Set(kept.map((f) => f.startLine))].sort((a, b) => a - b),
    };
    const list = byRole.get(role) ?? [];
    list.push(smartFile);
    byRole.set(role, list);
  }

  const groups: SmartDiffGroup[] = [];
  for (const role of SMART_DIFF_ROLE_ORDER) {
    const groupFiles = byRole.get(role);
    if (groupFiles && groupFiles.length > 0) groups.push({ role, files: groupFiles });
  }

  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: { ...SPLIT_SUGGESTION_DEFAULT, total_lines: totalLines },
  };
}
