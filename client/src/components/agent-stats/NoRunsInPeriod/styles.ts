import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    padding: 16,
    borderRadius: 10,
    border: "1px dashed var(--border-strong)",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,
};
