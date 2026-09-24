/* RoleGroup — one Smart Diff role group: a sticky, collapsible header
   (chevron, colored chip, role name + description, "● N files with
   findings" before "N files") and its files rendered through DiffViewer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { PrFile, SmartDiffFile, SmartDiffRole } from "@devdigest/shared";
import {
  DiffViewer,
  topSeverity,
  type DiffCommentApi,
  type DiffFindingApi,
} from "@/components/diff-viewer";
import { ROLE_META } from "../../constants";
import { s } from "./styles";

export function RoleGroup({
  role,
  smartFiles,
  files,
  defaultCollapsed,
  commenting,
  findings,
  stickyTop,
}: {
  role: SmartDiffRole;
  /** The smart-diff response's own file entries for this group (finding_ids). */
  smartFiles: SmartDiffFile[];
  /** The resolved `PrFile`s (with patch text) to actually render. */
  files: PrFile[];
  defaultCollapsed?: boolean;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
  stickyTop: number;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!defaultCollapsed);
  const meta = ROLE_META[role];

  const findingFileCount = smartFiles.filter((f) => f.finding_ids.length > 0).length;
  const groupFindingIds = new Set(smartFiles.flatMap((f) => f.finding_ids));
  const groupFindings = (findings?.findings ?? []).filter((f) => groupFindingIds.has(f.id));
  const top = topSeverity(groupFindings);

  return (
    <div style={s.group}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ ...s.header, top: stickyTop }}
      >
        <Icon.ChevronRight size={13} style={s.chevron(open)} />
        <span style={s.chip(meta.color)} />
        <span style={s.label}>{t(meta.labelKey)}</span>
        <span style={s.description}>{t(meta.descriptionKey)}</span>
        <span style={s.right}>
          {findingFileCount > 0 && top && (
            <span
              className="tnum"
              style={s.findingCount(SEV[top].c)}
              aria-label={t("smartDiff.filesWithFindings", { count: findingFileCount })}
            >
              ● {findingFileCount}
            </span>
          )}
          <span className="tnum">{t("smartDiff.filesCount", { count: files.length })}</span>
        </span>
      </button>
      {open && <DiffViewer files={files} commenting={commenting} findings={findings} />}
    </div>
  );
}
