import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 10 },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  heading: { fontSize: 14, fontWeight: 600, margin: 0 },
  note: { fontSize: 13, color: "var(--text-muted)", margin: 0 },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    minWidth: 0,
  },
  where: { fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)", minWidth: 0 },
  cells: { display: "flex", flexWrap: "wrap", gap: 8 },
  cell: { display: "flex", flexDirection: "column", gap: 2, minWidth: 120, fontSize: 12 },
  cellAgent: { color: "var(--text-muted)" },
} satisfies Record<string, CSSProperties>;
