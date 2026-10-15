import type { CSSProperties } from "react";

export const s = {
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  title: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  tableWrap: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    overflowX: "auto",
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    verticalAlign: "top",
  } satisfies CSSProperties,
  td: { padding: "10px 14px", borderTop: "1px solid var(--border)", verticalAlign: "middle" } satisfies CSSProperties,
  prCell: { display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 260 } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "none" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  pager: { display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 8, padding: 14 } satisfies CSSProperties,
} as const;
