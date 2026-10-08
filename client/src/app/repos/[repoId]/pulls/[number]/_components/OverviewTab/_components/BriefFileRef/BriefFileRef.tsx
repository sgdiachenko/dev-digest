/* BriefFileRef — a `path[:line]` pointer inside the brief. A file that is part
   of the PR is a button (jumps to Files changed); anything else is plain text
   labelled "not in this PR's diff". The path is middle-truncated for layout,
   with the full value in the tooltip and the accessible name. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { middleTruncate, parseFileRef } from "../../helpers";
import { s } from "./styles";

export function BriefFileRef({
  fileRef,
  changedFiles,
  onOpenFile,
}: {
  fileRef: string;
  changedFiles: readonly string[];
  onOpenFile: (path: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  const { path, line } = parseFileRef(fileRef);
  const label = `${middleTruncate(path)}${line != null ? `:${line}` : ""}`;

  if (!changedFiles.includes(path)) {
    return (
      <span style={s.text}>
        <span className="mono" title={fileRef}>
          {label}
        </span>
        <span style={s.note}>({t("card.notInDiff")})</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="mono"
      style={s.link}
      title={fileRef}
      aria-label={fileRef}
      onClick={() => onOpenFile(path, line)}
    >
      {label}
    </button>
  );
}
