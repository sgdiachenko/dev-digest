import type { CSSProperties } from "react";

export const s = {
  page: { padding: "20px 28px 64px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 14 } satisfies CSSProperties,
  title: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  actions: { marginLeft: "auto" } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  scroller: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflowX: "auto",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  table: { width: "100%", tableLayout: "fixed", borderCollapse: "collapse", minWidth: 1100 } satisfies CSSProperties,
  th: {
    padding: "10px 14px",
    textAlign: "left",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  notice: {
    marginBottom: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--warn-bg)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
