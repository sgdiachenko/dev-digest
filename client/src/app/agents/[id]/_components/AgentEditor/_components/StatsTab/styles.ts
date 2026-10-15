import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  controls: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  panels: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 } satisfies CSSProperties,
  skeletons: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 } satisfies CSSProperties,
  message: { fontSize: 14, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
} as const;
