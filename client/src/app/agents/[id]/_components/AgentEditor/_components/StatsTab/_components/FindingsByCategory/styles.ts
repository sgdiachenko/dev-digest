import type { CSSProperties } from "react";

export const s = {
  panel: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)", padding: 16, minWidth: 0 } satisfies CSSProperties,
  title: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: "0 0 10px",
  } satisfies CSSProperties,
} as const;
