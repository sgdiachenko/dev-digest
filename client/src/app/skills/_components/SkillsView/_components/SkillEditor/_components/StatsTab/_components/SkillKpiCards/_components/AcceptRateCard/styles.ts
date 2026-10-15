import type { CSSProperties } from "react";

export const s = {
  value: { fontSize: 30, fontWeight: 700, lineHeight: 1.1 } satisfies CSSProperties,
  line: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  hintTarget: { cursor: "help", borderBottom: "1px dotted var(--text-muted)" } satisfies CSSProperties,
};
