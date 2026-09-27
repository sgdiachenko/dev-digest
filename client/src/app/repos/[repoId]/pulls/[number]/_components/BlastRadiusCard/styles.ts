import type { CSSProperties } from "react";

export const s = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  statsRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  statItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,
  statIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  statCount: {
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  degradedReason: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  viewSwitch: {
    display: "flex",
    gap: 6,
  } satisfies CSSProperties,
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    fontSize: 12,
    color: "var(--text-secondary)",
    paddingBottom: 4,
  } satisfies CSSProperties,
  groups: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
} as const;
