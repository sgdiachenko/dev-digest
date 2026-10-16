import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 14, padding: "4px 16px 14px 56px" } satisfies CSSProperties,
  chartLink: { display: "inline-flex", borderRadius: 6, cursor: "pointer" } satisfies CSSProperties,
  caption: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
};
