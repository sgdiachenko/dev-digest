import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 14,
    border: "1px solid var(--crit)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  },
  title: { fontSize: 14, fontWeight: 600, margin: 0, color: "var(--crit)" },
  body: { fontSize: 13, margin: 0 },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  item: { display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0, fontSize: 13 },
  agent: { fontWeight: 600, flexShrink: 0 },
  error: { minWidth: 0, flex: 1 },
} satisfies Record<string, CSSProperties>;
