import type { CSSProperties } from "react";

export const s = {
  link: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    minWidth: 24,
    padding: "0 2px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--accent-text)",
    fontSize: 12.5,
    textAlign: "left",
    textDecoration: "underline",
    textUnderlineOffset: 2,
    maxWidth: "100%",
  } satisfies CSSProperties,
  text: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 24,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  note: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
} as const;
