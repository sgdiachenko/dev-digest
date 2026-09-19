import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--accent-bg)",
    border: "1px solid var(--accent)",
    borderRadius: 8,
    padding: "10px 12px",
  } satisfies CSSProperties,
  row: { display: "flex", gap: 12 } satisfies CSSProperties,
  rowItem: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  enabledRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  enabledLabel: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  fieldError: { color: "var(--crit)", fontSize: 12.5, marginTop: 4 } satisfies CSSProperties,
} as const;
