/** Overview → Files changed navigation: owns the `?file=&line=` URL target.
 *  `openFile` pushes a new history entry (Back returns to the Overview); a
 *  file outside the PR never changes the URL and is announced as a status. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { buildDiffHref, parseFileTarget, type FileTarget } from "./file-target";

interface Options {
  repoId: string;
  number: string;
  /** Paths of the PR's changed files. */
  changedFiles: readonly string[];
}

export interface PrFileNavigation {
  openFile: (path: string, line: number | null) => void;
  /** The validated URL target when the Files tab is open on a PR file, else null. */
  target: FileTarget | null;
  /** Text for a polite live region, or null. */
  statusMessage: string | null;
}

export function usePrFileNavigation({ repoId, number, changedFiles }: Options): PrFileNavigation {
  const t = useTranslations("brief");
  const router = useRouter();
  const search = useSearchParams();
  const searchKey = search.toString();
  // The status is tied to the URL it was raised on, so it clears itself as
  // soon as the user navigates anywhere (no effect needed).
  const [raised, setRaised] = React.useState<string | null>(null);

  const parsed = parseFileTarget(search, changedFiles);
  const target = parsed?.inPr ? parsed : null;
  const notInDiff = raised === searchKey || (parsed != null && !parsed.inPr);

  const openFile = (path: string, line: number | null) => {
    if (!changedFiles.includes(path)) {
      setRaised(searchKey);
      return;
    }
    setRaised(null);
    router.push(buildDiffHref(repoId, number, new URLSearchParams(searchKey), path, line));
  };

  return { openFile, target, statusMessage: notInDiff ? t("card.fileNotInDiff") : null };
}
