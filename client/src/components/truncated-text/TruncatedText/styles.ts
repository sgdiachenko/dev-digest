import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", alignItems: "flex-start", gap: 4, minWidth: 0 },
  collapsed: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  expanded: { flex: 1, minWidth: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  toggle: {
    flexShrink: 0,
    minWidth: 24,
    minHeight: 24,
    display: "grid",
    placeItems: "center",
    padding: 0,
    background: "transparent",
    border: "none",
    borderRadius: 4,
    color: "var(--text-muted)",
    cursor: "pointer",
  },
} satisfies Record<string, CSSProperties>;
