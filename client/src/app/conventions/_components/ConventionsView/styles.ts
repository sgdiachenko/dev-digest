import type { CSSProperties } from "react";

/* Hoisted out of JSX — inline literals are re-created on every render.
   Single-column page (not the Skills/Agents two-pane shape): a header, a
   scan summary, a filter/actions row, then the candidate list. */
export const s = {
  page: { maxWidth: 920, margin: "0 auto", padding: "28px 28px 64px" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  headingRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  heading: { fontSize: 22, fontWeight: 700 },
  headingRepo: { color: "var(--accent)" },
  subtitle: { marginTop: 6, fontSize: 13.5, color: "var(--text-secondary)", maxWidth: 640 },

  summaryRow: { marginTop: 18, fontSize: 13, color: "var(--text-muted)" },

  actionsRow: {
    marginTop: 18,
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  filterChips: { display: "flex", gap: 6, flexWrap: "wrap" },
  spacer: { flex: 1 },

  list: { marginTop: 18, display: "flex", flexDirection: "column", gap: 12 },

  emptyWrap: { marginTop: 48 },
  errorWrap: { marginTop: 48 },
  skeletonWrap: { marginTop: 18, display: "flex", flexDirection: "column", gap: 12 },
} satisfies Record<string, CSSProperties>;
