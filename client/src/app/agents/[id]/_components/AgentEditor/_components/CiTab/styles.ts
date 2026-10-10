import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  addRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px dashed var(--border-strong)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 2,
  } satisfies CSSProperties,
} as const;
