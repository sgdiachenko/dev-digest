import type { CSSProperties } from "react";
import { cell } from "../../styles";

export const s = {
  th: {
    ...cell,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  button: {
    all: "unset",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    textTransform: "inherit",
    letterSpacing: "inherit",
  } satisfies CSSProperties,
  buttonDisabled: { cursor: "default", opacity: 0.6 } satisfies CSSProperties,
  extra: { display: "block", marginTop: 2, textTransform: "none", letterSpacing: "normal", fontWeight: 400 } satisfies CSSProperties,
};
