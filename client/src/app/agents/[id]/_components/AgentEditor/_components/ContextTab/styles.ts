import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 640, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  repoRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 } satisfies CSSProperties,
  select: {
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  link: { color: "var(--accent)", fontSize: 13 } satisfies CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
