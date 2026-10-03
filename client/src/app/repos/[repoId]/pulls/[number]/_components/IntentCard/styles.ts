import type { CSSProperties } from "react";

export const s = {
  slot: {
    marginTop: 8,
    paddingTop: 20,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  quote: {
    fontSize: 15,
    color: "var(--text-primary)",
    lineHeight: 1.55,
    fontStyle: "italic",
    margin: "4px 0",
  } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
    gap: 16,
  } satisfies CSSProperties,
  scopeCol: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  scopeLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  scopeList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  scopeEmpty: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  sourcesToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    minHeight: 24,
  } satisfies CSSProperties,
  sourcesList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 8,
  } satisfies CSSProperties,
  sourceRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  sourceRef: {
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  sourceNote: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  } satisfies CSSProperties,
} as const;
