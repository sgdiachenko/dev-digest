import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  compactRow: { justifyContent: "flex-end" } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 } satisfies CSSProperties,
  body: { fontSize: 13, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  compactMeta: { textAlign: "right" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  error: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    fontSize: 13,
    color: "var(--crit)",
  } satisfies CSSProperties,
  link: {
    color: "var(--accent-text)",
    textDecoration: "underline",
    textUnderlineOffset: 2,
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
  } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
