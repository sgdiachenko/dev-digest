import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "13px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  repo: {
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
    minWidth: 120,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  run: { display: "inline-flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  when: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
