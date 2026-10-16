import type { CSSProperties } from "react";

export const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  } satisfies CSSProperties,
};
