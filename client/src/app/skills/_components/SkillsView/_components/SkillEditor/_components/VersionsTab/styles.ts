import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 6, maxWidth: 760 } satisfies CSSProperties,
  headRow: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  heading: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  caption: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    marginBottom: 8,
  } satisfies CSSProperties,
  versionChip: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--accent)",
    background: "var(--accent-bg)",
    padding: "2px 8px",
    borderRadius: 5,
    flexShrink: 0,
  } satisfies CSSProperties,
  note: { flex: 1, fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
} as const;
