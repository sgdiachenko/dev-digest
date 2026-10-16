import type { CSSProperties } from "react";
import { cell } from "../../styles";

export const s = {
  td: { ...cell, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  nameCell: { display: "flex", alignItems: "center", gap: 8, minWidth: 0, maxWidth: 260, fontWeight: 600 } satisfies CSSProperties,
  expand: {
    all: "unset",
    cursor: "pointer",
    width: 18,
    textAlign: "center",
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  lastRun: { color: "var(--text-muted)", cursor: "default" } satisfies CSSProperties,
  expansionTd: { padding: 0 } satisfies CSSProperties,
  link: { color: "var(--accent)", textDecoration: "none", fontWeight: 600 } satisfies CSSProperties,
};
