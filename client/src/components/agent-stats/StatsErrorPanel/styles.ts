import type { CSSProperties } from "react";

export const s = {
  panel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  reason: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
};
