import type { CSSProperties } from "react";

export const s = {
  section: { marginTop: 20 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 700, marginBottom: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    padding: "8px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  link: { fontSize: 12, color: "var(--accent)", textDecoration: "none" } satisfies CSSProperties,
  viewLink: { fontSize: 12, color: "var(--accent)", textDecoration: "none", marginLeft: "auto" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
};
