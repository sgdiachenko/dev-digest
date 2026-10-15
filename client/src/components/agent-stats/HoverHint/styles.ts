import type { CSSProperties } from "react";

export const s = {
  wrap: { position: "relative", display: "inline-flex", minWidth: 0, maxWidth: "100%" } satisfies CSSProperties,
  tooltip: {
    position: "absolute",
    top: "100%",
    left: 0,
    zIndex: 20,
    marginTop: 4,
    padding: "6px 8px",
    width: "max-content",
    maxWidth: 260,
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 1.4,
    textTransform: "none",
    letterSpacing: 0,
    whiteSpace: "normal",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
};
