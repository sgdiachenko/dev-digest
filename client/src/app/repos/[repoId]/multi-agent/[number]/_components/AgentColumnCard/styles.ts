import type { CSSProperties } from "react";

export const card = (accent: string): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  border: "1px solid var(--border)",
  borderTop: `2px solid ${accent}`,
  borderRadius: 12,
  background: "var(--bg-elevated)",
  overflow: "hidden",
});

export const tile = (accent: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  flexShrink: 0,
  borderRadius: 8,
  color: accent,
  background: `color-mix(in srgb, ${accent} 15%, transparent)`,
});

export const item = (color: string): CSSProperties => ({
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  minWidth: 0,
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderLeft: `3px solid ${color}`,
  borderRadius: 8,
  background: "var(--bg-surface)",
});

export const s = {
  head: { display: "flex", alignItems: "center", gap: 12, padding: 14, minWidth: 0 },
  headText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 },
  name: { fontSize: 15, fontWeight: 700, minWidth: 0 },
  meta: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "2px 8px",
    fontSize: 12,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono, monospace)",
  },
  status: { display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 },
  body: { display: "flex", flexDirection: "column", gap: 8, padding: "0 14px 14px", minWidth: 0, flex: 1 },
  error: { fontSize: 13, color: "var(--crit)", minWidth: 0 },
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  itemBody: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 },
  title: { fontSize: 14, fontWeight: 700, minWidth: 0 },
  path: { fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)", minWidth: 0 },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "10px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 13,
  },
  trace: {
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 13,
  },
  count: { color: "var(--text-muted)" },
} satisfies Record<string, CSSProperties>;
