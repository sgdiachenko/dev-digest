import type { CSSProperties } from "react";

export const s = {
  wrap: {
    overflowX: "auto",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 } satisfies CSSProperties,
  viewTh: { width: 1, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  cap: { padding: "10px 16px", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
};

/** Cell frame shared by the header and the row cells. */
export const cell = {
  padding: "12px 16px",
  textAlign: "left",
  verticalAlign: "middle",
} satisfies CSSProperties;
