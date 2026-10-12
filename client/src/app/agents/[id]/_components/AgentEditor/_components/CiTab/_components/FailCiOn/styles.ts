import type { CSSProperties } from "react";

export const s = {
  card: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 16,
  } satisfies CSSProperties,
  text: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  hint: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  note: { fontSize: 11.5, color: "var(--warn)", marginTop: 4, fontWeight: 600 } satisfies CSSProperties,
  error: { fontSize: 11.5, color: "var(--crit)", marginTop: 4 } satisfies CSSProperties,
  group: {
    display: "flex",
    gap: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 2,
    flexShrink: 0,
  } satisfies CSSProperties,
  option: {
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 5,
    border: "none",
    cursor: "pointer",
    background: "transparent",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  optionOn: { background: "var(--bg-elevated)", color: "var(--text-primary)", boxShadow: "inset 0 0 0 1px var(--border-strong)" } satisfies CSSProperties,
} as const;
