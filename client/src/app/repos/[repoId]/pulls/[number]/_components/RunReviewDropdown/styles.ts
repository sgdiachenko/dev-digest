import type { CSSProperties } from "react";

/** Co-located styles for RunReviewDropdown. */
export const s = {
  root: { position: "relative", display: "inline-block" },
  panel: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    zIndex: 50,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0,0,0,.25)",
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minHeight: 28,
    padding: "5px 8px",
    background: "transparent",
    border: "none",
    borderRadius: 5,
    color: "var(--text-primary)",
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
  },
  muted: { color: "var(--text-muted)" },
  warning: { display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", fontSize: 12.5, color: "var(--text-muted)" },
  divider: { height: 1, background: "var(--border)", margin: "4px 0" },
} satisfies Record<string, CSSProperties>;
