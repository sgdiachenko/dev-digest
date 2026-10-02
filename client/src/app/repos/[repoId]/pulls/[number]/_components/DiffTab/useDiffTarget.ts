/** Applies a navigation target to the Files-changed tab exactly once per
 *  target: waits for the data it depends on, then scrolls the target below the
 *  sticky headers, focuses it and highlights it for a short while. */
"use client";

import React from "react";
import type { DiffTarget } from "@/components/diff-viewer";

export const HIGHLIGHT_MS = 2000;

export interface DiffTargetInput {
  path: string;
  line: number | null;
  key: string;
}

/** Height of the sticky role-group header that wraps `el`, if any. */
function stickyGroupHeight(el: HTMLElement): number {
  const header = el.closest("[data-role-group]")?.querySelector<HTMLElement>("[data-role-header]");
  return header ? header.getBoundingClientRect().height : 0;
}

/**
 * @param input  the validated URL target, or null
 * @param ready  false while data that changes the layout (Smart Diff order) is
 *               still loading — the target is held back until it settles
 * @param headerHeight PrDetailHeader's measured sticky height
 * @param lineNotInDiffLabel text for a target line that is not rendered
 * @returns the target to hand to the viewer (null until ready)
 */
export function useDiffTarget(
  input: DiffTargetInput | null,
  ready: boolean,
  headerHeight: number,
  lineNotInDiffLabel: string,
): DiffTarget | null {
  const [highlighted, setHighlighted] = React.useState(false);
  const appliedKey = React.useRef<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const key = input?.key ?? null;
  const onApplied = (el: HTMLElement) => {
    if (!key || appliedKey.current === key) return; // once per target
    appliedKey.current = key;
    const stickyTop = headerHeight + stickyGroupHeight(el);
    const fileHeader = el.closest("[data-diff-file-card]")?.querySelector<HTMLElement>("[data-diff-file]");
    if (fileHeader && fileHeader !== el) {
      // Keep the file name in view when the requested line is deep in a patch.
      fileHeader.style.top = `${stickyTop}px`;
    }
    el.style.scrollMarginTop = `${stickyTop + (fileHeader && fileHeader !== el ? fileHeader.getBoundingClientRect().height : 0)}px`;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: "start" });
    if (timer.current) clearTimeout(timer.current);
    setHighlighted(true);
    timer.current = setTimeout(() => setHighlighted(false), HIGHLIGHT_MS);
  };

  if (!input || !ready) return null;
  return { ...input, lineNotInDiffLabel, highlighted, onApplied };
}
