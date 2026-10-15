import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 } satisfies CSSProperties,
  value: { fontSize: 30, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  line: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
