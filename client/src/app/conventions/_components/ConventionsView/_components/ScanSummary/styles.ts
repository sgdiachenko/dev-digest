import type { CSSProperties } from "react";

export const s = {
  wrap: { fontSize: 13, color: "var(--text-muted)" },
  counters: { marginTop: 2 },
} satisfies Record<string, CSSProperties>;
