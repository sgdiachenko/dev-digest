import type { CSSProperties } from "react";

export const s = {
  value: { fontSize: 30, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  line: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  progress: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
};
