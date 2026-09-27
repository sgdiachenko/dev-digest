import type { CSSProperties } from "react";

export const s = {
  container: {
    position: "relative",
    width: "100%",
    overflowX: "auto",
  } satisfies CSSProperties,
  svg: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  } satisfies CSSProperties,
  nodeWrap: {
    position: "absolute",
    transform: "translateY(-50%)",
  } satisfies CSSProperties,
} as const;
