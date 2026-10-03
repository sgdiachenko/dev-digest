import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--bg-hover)",
    border: "none",
    borderRadius: 6,
    padding: "8px 10px",
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
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 8,
    rowGap: 2,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  callerPath: {
    minWidth: 0,
    overflowWrap: "anywhere",
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
  impactLists: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  impactGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  } satisfies CSSProperties,
  impactLabel: {
    color: "var(--text-muted)",
    fontSize: 11,
    paddingLeft: 12,
  } satisfies CSSProperties,
} as const;
