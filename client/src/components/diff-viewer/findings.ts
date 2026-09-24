/* Finding support for the DiffViewer (Smart Diff annotations). Pure helpers +
   the API shape the viewer needs; React bits live in CodeLine/FileCard. */
import type { FindingActionKind, FindingRecord, Severity } from "@devdigest/shared";
import { lineKey } from "./comments";

/** What the viewer needs to render inline finding annotations. */
export interface DiffFindingApi {
  findings: FindingRecord[];
  /** One switch (D8) also gates GitHub comment threads — see `DiffCommentApi.showComments`. */
  showFindings: boolean;
  pending?: boolean;
  onAction?: (findingId: string, action: FindingActionKind, reply?: string) => void;
  repoFullName?: string | null;
  headSha?: string | null;
}

/** `RIGHT:${start_line}` — findings are always anchored to the new/RIGHT
 *  side of the diff, same key shape `lineKey`/comment threads use. */
export function findingKey(f: Pick<FindingRecord, "start_line">): string | null {
  return lineKey("RIGHT", f.start_line);
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** The most severe finding in a list (CRITICAL > WARNING > SUGGESTION > INFO),
 *  or null for an empty list. Drives the line's stripe/label color. */
export function topSeverity(findings: FindingRecord[]): Severity | null {
  if (findings.length === 0) return null;
  return findings.reduce<Severity>(
    (top, f) => (SEVERITY_RANK[f.severity] < SEVERITY_RANK[top] ? f.severity : top),
    findings[0]!.severity,
  );
}

/**
 * Split a file's findings into ones anchored to a rendered line and ones
 * "outside the diff" (its `start_line` isn't in this patch — e.g. an older
 * round's finding on a line the current diff no longer touches). Modeled on
 * `comments.ts`'s `partitionThreads`.
 */
export function partitionFindings(
  findings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; outside: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const outside: FindingRecord[] = [];
  for (const f of findings) {
    const key = findingKey(f);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      outside.push(f);
    }
  }
  return { matched, outside };
}
