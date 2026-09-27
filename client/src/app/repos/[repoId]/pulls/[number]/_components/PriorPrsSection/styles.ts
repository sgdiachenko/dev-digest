import type { CSSProperties } from "react";

export const s = {
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
  } satisfies CSSProperties,
  chevron: {
    flexShrink: 0,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
  } satisfies CSSProperties,
  count: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingLeft: 12,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  link: {
    color: "var(--accent-text)",
    textDecoration: "none",
  } satisfies CSSProperties,
  rowTitle: {
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  rowMeta: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
