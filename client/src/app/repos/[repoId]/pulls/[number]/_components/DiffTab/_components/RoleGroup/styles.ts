import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 18,
  } satisfies CSSProperties,
  header: {
    position: "sticky",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  }),
  chip: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: color,
    flexShrink: 0,
  }),
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
    flexShrink: 0,
  } satisfies CSSProperties,
  description: {
    fontSize: 12,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  right: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  findingCount: (color: string): CSSProperties => ({
    fontWeight: 700,
    color,
  }),
} as const;
