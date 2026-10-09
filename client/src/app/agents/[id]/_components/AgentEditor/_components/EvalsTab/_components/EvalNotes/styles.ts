import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  note: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    margin: 0,
    fontSize: 12.5,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  hint: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    margin: 0,
    fontSize: 12.5,
    color: "var(--warn)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
} as const;
