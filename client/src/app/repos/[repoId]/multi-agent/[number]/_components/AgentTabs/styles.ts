import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
    padding: "0 4px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  tab: (selected: boolean, accent: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    minWidth: 24,
    maxWidth: 260,
    padding: "8px 16px",
    border: "none",
    borderBottom: `2px solid ${selected ? accent : "transparent"}`,
    marginBottom: -1,
    background: "transparent",
    color: selected ? "var(--text-primary)" : "var(--text-muted)",
    fontSize: 14,
    fontWeight: selected ? 600 : 500,
    cursor: "pointer",
  }),
  icon: (accent: string): CSSProperties => ({ display: "inline-flex", flexShrink: 0, color: accent }),
  name: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  score: (color: string): CSSProperties => ({ flexShrink: 0, fontSize: 13, fontWeight: 600, color }),
};
