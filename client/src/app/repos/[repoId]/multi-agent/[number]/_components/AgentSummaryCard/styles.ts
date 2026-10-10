import type { CSSProperties } from "react";

export const card = (accent: string): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "16px 20px",
  border: "1px solid var(--border)",
  borderLeft: `3px solid ${accent}`,
  borderRadius: 10,
  background: "var(--bg-elevated)",
});

export const s = {
  text: { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: (accent: string): CSSProperties => ({ margin: 0, fontSize: 16, fontWeight: 600, color: accent }),
  summary: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.5,
    color: "var(--text-muted)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  side: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  } satisfies CSSProperties,
  trace: {
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
  } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
};
