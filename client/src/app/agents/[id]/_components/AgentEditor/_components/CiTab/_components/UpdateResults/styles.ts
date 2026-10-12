import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: "0 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, flexWrap: "wrap" } satisfies CSSProperties,
  repo: { fontWeight: 600 } satisfies CSSProperties,
  link: { color: "var(--accent-text)" } satisfies CSSProperties,
  fail: { color: "var(--crit)" } satisfies CSSProperties,
} as const;
