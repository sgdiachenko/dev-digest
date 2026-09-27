import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "10px 0",
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
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 8,
  } satisfies CSSProperties,
  symbolName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
  } satisfies CSSProperties,
  callerCount: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingLeft: 12,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  callerName: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  subList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    paddingLeft: 12,
  } satisfies CSSProperties,
} as const;
