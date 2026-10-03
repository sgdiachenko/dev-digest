import type { CSSProperties } from "react";

export const s = {
  briefCard: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  } satisfies CSSProperties,
  loadFailed: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    fontSize: 13,
    color: "var(--crit)",
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
    gap: 24,
    alignItems: "start",
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
