import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 } satisfies CSSProperties,
};
