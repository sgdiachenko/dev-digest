import type { CSSProperties } from "react";

export const s = {
  steps: { padding: "14px 24px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  spacer: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  confirm: {
    margin: "0 24px 16px",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--warn-bg)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
