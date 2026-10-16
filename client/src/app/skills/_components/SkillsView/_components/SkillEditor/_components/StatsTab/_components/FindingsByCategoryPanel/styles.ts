import type { CSSProperties } from "react";

export const s = {
  panel: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)", padding: 16, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", margin: "0 0 12px" } satisfies CSSProperties,
};
