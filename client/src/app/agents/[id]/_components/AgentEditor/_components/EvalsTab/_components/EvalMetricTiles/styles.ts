import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  tile: {
    flex: "1 1 180px",
    minWidth: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
  } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  valueRow: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 12, flexWrap: "wrap" } satisfies CSSProperties,
  value: { fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  delta: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
} as const;
