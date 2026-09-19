import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  caption: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  notice: {
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 7,
    padding: "10px 12px",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 20,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
