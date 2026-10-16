import type { CSSProperties } from "react";

export const PALETTE = [
  "var(--accent)",
  "var(--ok)",
  "var(--warn)",
  "var(--crit)",
  "#8b5cf6",
  "var(--info)",
];

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" } satisfies CSSProperties,
  legend: { display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none", minWidth: 160, flex: 1 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, minWidth: 0 } satisfies CSSProperties,
  label: { flex: 1, minWidth: 0, color: "var(--text-secondary)", display: "flex" } satisfies CSSProperties,
  value: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  share: { width: 40, textAlign: "right", color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
};
