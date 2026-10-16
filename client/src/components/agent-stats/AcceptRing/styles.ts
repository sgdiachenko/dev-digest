import type { CSSProperties } from "react";
import type { AcceptLevel } from "../../../lib/agent-stats/accept";

export const LEVEL_COLOR: Record<AcceptLevel, string> = {
  good: "var(--ok)",
  warning: "var(--warn)",
  poor: "var(--crit)",
  muted: "var(--text-muted)",
};

export const s = {
  wrap: { position: "relative", flexShrink: 0 } satisfies CSSProperties,
  svg: { transform: "rotate(-90deg)", display: "block" } satisfies CSSProperties,
  label: { position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 700 } satisfies CSSProperties,
};
