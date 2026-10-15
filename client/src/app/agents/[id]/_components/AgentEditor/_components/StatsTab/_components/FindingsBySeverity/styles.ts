import type { CSSProperties } from "react";

export const BAR_HEIGHT = 110;

/** Thinner bars as the bucket count grows (at most 30 buckets). */
export function barWidth(count: number): number {
  return count <= 8 ? 40 : count <= 16 ? 24 : 12;
}

export const s = {
  panel: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)", padding: 16, minWidth: 0 } satisfies CSSProperties,
  title: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: "0 0 10px",
  } satisfies CSSProperties,
  bars: { display: "flex", alignItems: "flex-end", gap: 8, height: BAR_HEIGHT } satisfies CSSProperties,
  slot: { flex: "0 0 auto", height: "100%", display: "flex", alignItems: "flex-end" } satisfies CSSProperties,
  bar: (width: number, height: number): CSSProperties => ({
    width,
    height,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    borderRadius: 3,
    overflow: "hidden",
    outlineOffset: 2,
  }),
  legend: { display: "flex", gap: 14, flexWrap: "wrap", margin: "12px 0 0", padding: 0, listStyle: "none", fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ width: 9, height: 9, borderRadius: 2, background: color }),
  segment: (color: string, percent: number): CSSProperties => ({ height: `${percent}%`, background: color }),
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
