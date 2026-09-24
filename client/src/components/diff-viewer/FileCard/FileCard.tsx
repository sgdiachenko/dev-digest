/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { type DiffFindingApi, partitionFindings, topSeverity } from "../findings";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { OutsideDiffFindings } from "../OutsideDiffFindings";
import type { FindingRecord } from "@devdigest/shared";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Findings anchored to a given parsed line (RIGHT=new side only). */
function findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[] {
  if (matched.size === 0 || ln.newNo == null) return [];
  return matched.get(`RIGHT:${ln.newNo}`) ?? [];
}

export function FileCard({
  file,
  commenting,
  findings: findingApi,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  const tPr = useTranslations("prReview");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  // Same split for findings: matched (anchored to a rendered line) vs. outside
  // the current diff (start_line isn't in this patch).
  const fileFindings = findingApi?.findings;
  const { matched: matchedFindings, outside: outsideFindings } = React.useMemo(() => {
    if (!fileFindings) return { matched: new Map<string, FindingRecord[]>(), outside: [] };
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionFindings(
      fileFindings.filter((f) => f.file === file.path),
      renderedKeys,
    );
  }, [fileFindings, file.path, lines]);

  const fileFindingsCount = fileFindings ? fileFindings.filter((f) => f.file === file.path).length : 0;
  const fileTopSeverity = topSeverity(fileFindings?.filter((f) => f.file === file.path) ?? []);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {fileFindingsCount > 0 && fileTopSeverity && (
          <span
            role="img"
            aria-label={tPr("smartDiff.fileHasFindings")}
            style={s.findingDot(SEV[fileTopSeverity].c)}
          />
        )}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={findingsForLine(ln, matchedFindings)}
                findingApi={findingApi}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findingApi?.showFindings && (
            <OutsideDiffFindings
              findings={outsideFindings}
              pending={findingApi.pending}
              onAction={findingApi.onAction}
              repoFullName={findingApi.repoFullName}
              headSha={findingApi.headSha}
            />
          )}
        </div>
      )}
    </div>
  );
}
