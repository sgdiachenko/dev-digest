import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 } satisfies CSSProperties,
  metrics: { display: "flex", gap: 14 } satisfies CSSProperties,
  panels: { display: "flex", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  panel: {
    flex: "1 1 320px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  panelTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    marginBottom: 12,
  } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
    fontSize: 13,
    color: "var(--accent-text)",
    textDecoration: "none",
  } satisfies CSSProperties,
  agentRowFirst: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 0",
    fontSize: 13,
    color: "var(--accent-text)",
    textDecoration: "none",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
} as const;
