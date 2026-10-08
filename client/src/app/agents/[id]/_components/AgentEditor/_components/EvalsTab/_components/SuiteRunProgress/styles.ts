import type { CSSProperties } from "react";

export const s = {
  box: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  empty: { position: "absolute", width: 1, height: 1, overflow: "hidden" } satisfies CSSProperties,
} as const;
