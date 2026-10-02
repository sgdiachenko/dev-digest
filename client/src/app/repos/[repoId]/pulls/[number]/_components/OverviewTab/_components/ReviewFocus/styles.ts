import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  item: { display: "flex", alignItems: "baseline", gap: 10, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  bullet: { color: "var(--accent-text)", flexShrink: 0 } satisfies CSSProperties,
  link: {
    minHeight: 24,
    minWidth: 24,
    padding: "0 2px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--accent-text)",
    fontSize: 12.5,
    textAlign: "left",
    textDecoration: "none",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
