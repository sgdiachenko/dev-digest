import type { CSSProperties } from "react";

/** Co-located styles for the Onboarding Tour page. */
export const s = {
  page: { maxWidth: 1240, margin: "0 auto", padding: "28px 28px 64px", display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  title: { fontSize: 28, fontWeight: 700, margin: 0, overflowWrap: "anywhere", letterSpacing: "-0.02em" } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
  /** Nav + content; wraps so the nav sits above the content on narrow screens. */
  layout: { display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" } satisfies CSSProperties,
  /** Stretches to the content's height: the sticky nav inside can only travel within this box. */
  nav: { flex: "0 0 200px", maxWidth: "100%", alignSelf: "stretch" } satisfies CSSProperties,
  /** Right column: header, banner and the cards. */
  main: { flex: "1 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  content: { display: "flex", flexDirection: "column", gap: 20, minWidth: 0 } satisfies CSSProperties,
  banner: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 12px",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  skeletonCard: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--bg-elevated)",
    padding: 20,
    scrollMarginTop: 72,
  } satisfies CSSProperties,
  /** "Regenerating" note laid over the still-visible current content. */
  regenerating: { margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  /** Shared by the section bodies. */
  mono: { fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  /** Darker inset bar / box inside a card. */
  inset: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    minWidth: 0,
  } satisfies CSSProperties,
  /** Reset list: no bullets, no indent, vertical stack. */
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  /** Small muted sub-heading inside a card. */
  subHeading: { fontSize: 12, fontWeight: 600, margin: 0, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" } satisfies CSSProperties,
  liveRegion: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
