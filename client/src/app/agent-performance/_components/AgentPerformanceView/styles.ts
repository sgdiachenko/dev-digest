import type { CSSProperties } from "react";

export const s = {
  page: { maxWidth: 1100, margin: "0 auto", padding: "28px 28px 64px", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" } satisfies CSSProperties,
  heading: { fontSize: 22, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { marginTop: 6, fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  scopeNote: { fontSize: 12.5, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  statusRow: { display: "flex", alignItems: "center", gap: 12, minHeight: 20 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  skeletonGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 } satisfies CSSProperties,
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
    padding: 24,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 14,
  } satisfies CSSProperties,
  link: { color: "var(--accent)", textDecoration: "underline" } satisfies CSSProperties,
};
