import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, margin: 0, flex: 1 } satisfies CSSProperties,
  link: { fontSize: 13, color: "var(--accent)", textDecoration: "underline" } satisfies CSSProperties,
  scroll: { overflowX: "auto" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "8px 12px",
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: { padding: "10px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
  status: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  empty: {
    padding: "24px 20px",
    border: "1px dashed var(--border-strong)",
    borderRadius: 9,
    color: "var(--text-secondary)",
    fontSize: 14,
    textAlign: "center",
  } satisfies CSSProperties,
} as const;
