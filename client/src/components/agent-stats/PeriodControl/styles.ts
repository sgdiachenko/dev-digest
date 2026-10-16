import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  label: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  field: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  input: {
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  reason: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  resolved: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  notice: { fontSize: 12, color: "var(--warn)", margin: 0 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", margin: 0 } satisfies CSSProperties,
};
