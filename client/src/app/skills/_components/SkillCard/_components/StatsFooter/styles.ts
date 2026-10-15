import type { CSSProperties } from "react";
import type { AcceptLevel } from "../../../../../../lib/agent-stats/accept";

/** Accept-scale colours, the same tokens the shared AcceptRing / AcceptText use. */
export const LEVEL_COLOR: Record<AcceptLevel, string> = {
  good: "var(--ok)",
  warning: "var(--warn)",
  poor: "var(--crit)",
  muted: "var(--text-muted)",
};

export const s = {
  footer: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  sep: { color: "var(--border-strong)" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
};
