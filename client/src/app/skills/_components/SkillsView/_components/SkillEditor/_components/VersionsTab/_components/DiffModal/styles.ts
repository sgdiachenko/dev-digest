import type { CSSProperties } from "react";

export const s = {
  body: { padding: 4, fontSize: 12.5, lineHeight: 1.6 } satisfies CSSProperties,
  line: (kind: "add" | "del" | "ctx"): CSSProperties => ({
    display: "flex",
    gap: 10,
    padding: "0 16px",
    whiteSpace: "pre-wrap",
    background: kind === "add" ? "var(--ok-bg)" : kind === "del" ? "var(--crit-bg)" : "transparent",
    color: kind === "add" ? "var(--ok)" : kind === "del" ? "var(--crit)" : "var(--text-secondary)",
  }),
  marker: { width: 14, flexShrink: 0, opacity: 0.7 } satisfies CSSProperties,
  loading: { padding: 24, textAlign: "center", color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
