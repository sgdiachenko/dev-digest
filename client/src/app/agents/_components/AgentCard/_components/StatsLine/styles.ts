import type { CSSProperties } from "react";
import type { AcceptLevel } from "../../../../../../lib/agent-stats/accept";

const LEVEL_COLOR: Record<AcceptLevel, string> = {
  good: "var(--ok)",
  warning: "var(--warn)",
  poor: "var(--crit)",
  muted: "var(--text-muted)",
};

export const s = {
  line: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  accept: (level: AcceptLevel): CSSProperties => ({ color: LEVEL_COLOR[level], fontWeight: 600 }),
  avg: { cursor: "help" } satisfies CSSProperties,
} as const;
