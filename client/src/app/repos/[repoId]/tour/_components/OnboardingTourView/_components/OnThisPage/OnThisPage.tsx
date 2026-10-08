"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NARROW_BREAKPOINT_PX } from "../../constants";

export interface OnThisPageItem {
  /** Anchor id of the section (one of SECTION_IDS). */
  id: string;
  label: string;
}

/** Tracks `(max-width: 1023px)` via a media-query listener (no DOM measurement involved). */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT_PX - 1}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

/**
 * "On this page" navigation: a sticky list on wide screens, a "Jump to" select on narrow ones.
 * Activating an entry expands the section (`onExpand`), scrolls to it, focuses its heading and sets the hash.
 * Every section keeps its entry, even an empty one.
 */
export function OnThisPage({
  items,
  activeId,
  onExpand,
}: {
  items: OnThisPageItem[];
  /** Section currently at the top of the viewport (the view derives it), marked `aria-current`. */
  activeId: string | null;
  /** Called first so a collapsed target is open before it is scrolled to. */
  onExpand: (id: string) => void;
}) {
  const t = useTranslations("onboarding");
  const narrow = useIsNarrow();

  function go(id: string) {
    onExpand(id);
    document.getElementById(id)?.scrollIntoView?.({ block: "start" });
    document.getElementById(`${id}-heading`)?.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${id}`);
  }

  if (narrow) {
    return (
      <nav aria-label={t("onThisPage")}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          {t("jumpTo")}
          <select
            value={activeId ?? ""}
            onChange={(e) => e.target.value && go(e.target.value)}
            style={{ minHeight: 32, maxWidth: "100%" }}
          >
            {activeId === null && <option value="" />}
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
      </nav>
    );
  }

  return (
    <nav aria-label={t("onThisPage")} style={{ position: "sticky", top: 16, alignSelf: "flex-start" }}>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          margin: "6px 0 10px",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {t("onThisPage")}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={i.id === activeId ? "location" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go(i.id);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                minHeight: 28,
                padding: "4px 12px",
                fontSize: 13,
                fontWeight: i.id === activeId ? 600 : 400,
                color: i.id === activeId ? "var(--text-primary)" : "var(--text-secondary)",
                borderLeft: `2px solid ${i.id === activeId ? "var(--accent)" : "transparent"}`,
                textDecoration: "none",
              }}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
