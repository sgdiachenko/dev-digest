import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  button: {
    display: "inline-flex",
    padding: 2,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,
};
