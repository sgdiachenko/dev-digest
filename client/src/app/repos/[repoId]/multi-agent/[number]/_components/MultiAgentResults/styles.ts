import type { CSSProperties } from "react";

export const s = {
  root: { maxWidth: 1180, margin: "0 auto", padding: "24px clamp(12px, 3vw, 32px) 44px", display: "flex", flexDirection: "column", gap: 20, minWidth: 0 },
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  h1: { fontSize: 20, fontWeight: 600, margin: 0 },
  sub: { margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" },
  switch: { display: "flex", gap: 4 },
  error: { fontSize: 13, color: "var(--crit)", margin: 0 },
  link: { color: "var(--accent)", fontSize: 13 },
  skeletons: { display: "flex", flexDirection: "column", gap: 12 },
} satisfies Record<string, CSSProperties>;
