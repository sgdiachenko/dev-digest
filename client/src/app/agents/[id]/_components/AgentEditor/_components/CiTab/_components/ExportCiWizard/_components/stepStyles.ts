import type { CSSProperties } from "react";

/** Styles shared by the four step bodies. */
export const step = {
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, display: "block" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.45 } satisfies CSSProperties,
  card: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    fontSize: 13,
  } satisfies CSSProperties,
  cardOn: { borderColor: "var(--accent)", background: "var(--accent-bg)" } satisfies CSSProperties,
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 14,
  } satisfies CSSProperties,
  notice: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--warn-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  error: { color: "var(--crit)", fontSize: 13 } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
} as const;
