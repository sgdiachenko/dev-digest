import type { CSSProperties } from "react";

export const s = {
  td: { padding: "12px 14px", fontSize: 12.5, verticalAlign: "middle", borderBottom: "1px solid var(--border)", overflow: "hidden" } satisfies CSSProperties,
  ellipsis: { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 11.5 } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)", fontSize: 11 } satisfies CSSProperties,
  link: { color: "var(--accent-text)" } satisfies CSSProperties,
  counts: { display: "flex", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  count: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 600 } satisfies CSSProperties,
} as const;
