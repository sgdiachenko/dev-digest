import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, cursor: "default" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontWeight: 400 } satisfies CSSProperties,
  arrowUp: { color: "var(--ok)" } satisfies CSSProperties,
  arrowDown: { color: "var(--crit)" } satisfies CSSProperties,
};
