import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  notice: {
    marginBottom: 8,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--warn-bg)",
    fontSize: 13,
  } satisfies CSSProperties,
  ok: { marginBottom: 8, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
} as const;
