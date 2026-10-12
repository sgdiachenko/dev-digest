import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 16 },
  panel: { display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 },
  note: { fontSize: 13, color: "var(--text-muted)", margin: 0 },
} satisfies Record<string, CSSProperties>;
