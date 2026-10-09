import type { CSSProperties } from "react";

/** Co-located styles for the Evals tab shell. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 24, maxWidth: 1100 } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  staleBanner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--crit-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
