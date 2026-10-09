import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  passing: {
    fontSize: 12.5,
    fontWeight: 600,
    padding: "2px 10px",
    borderRadius: 5,
    background: "var(--ok-bg)",
    color: "var(--ok)",
  } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  reason: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10, listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  empty: {
    padding: "28px 20px",
    border: "1px dashed var(--border-strong)",
    borderRadius: 9,
    color: "var(--text-secondary)",
    fontSize: 14,
    textAlign: "center",
  } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
