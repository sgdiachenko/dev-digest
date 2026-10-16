import type { CSSProperties } from "react";

export const s = {
  region: { display: "inline-flex", alignItems: "center", gap: 8, minHeight: 20, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  failed: { color: "var(--warn)" } satisfies CSSProperties,
};
