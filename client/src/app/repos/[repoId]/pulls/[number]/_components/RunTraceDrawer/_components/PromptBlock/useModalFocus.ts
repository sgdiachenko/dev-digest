/* useModalFocus — keyboard behaviour for a fullscreen dialog built on the vendored
   `Modal`, which sets role="dialog" + aria-modal but does not move focus into the dialog,
   close on Escape or keep Tab inside. The vendored primitive is shared by ~8 dialogs and
   is composed, not patched (client/AGENTS.md), so this lives next to its one caller. */
"use client";

import React from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Hidden controls can't take focus; computed style (not layout) so this also holds in jsdom. */
function isVisible(e: HTMLElement): boolean {
  const cs = getComputedStyle(e);
  return cs.display !== "none" && cs.visibility !== "hidden";
}

function focusablesIn(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
}

/**
 * While `open`: focus moves into the dialog (the search field when there is one), Escape calls
 * `onClose`, Tab and Shift+Tab wrap inside the dialog, and on close focus returns to whatever had
 * it before. `bodyRef` must point at an element rendered inside the dialog's children.
 */
export function useModalFocus(open: boolean, onClose: () => void, bodyRef: React.RefObject<HTMLElement | null>) {
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;
    const dialog = bodyRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const returnTo = document.activeElement as HTMLElement | null;

    const initial = dialog.querySelector<HTMLElement>("input") ?? focusablesIn(dialog)[0];
    initial?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusablesIn(dialog);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !dialog.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnTo?.focus();
    };
  }, [open, bodyRef]);
}
