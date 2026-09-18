import type { CSSProperties } from "react";

export const s = {
  card: (status: "pending" | "accepted" | "rejected"): CSSProperties => ({
    borderRadius: 10,
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${
      status === "accepted" ? "var(--ok)" : status === "rejected" ? "var(--text-muted)" : "var(--warn)"
    }`,
    background: "var(--bg-surface)",
    padding: 18,
    opacity: status === "rejected" ? 0.65 : 1,
  }),
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  ruleCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 },
  ruleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rule: { fontSize: 15, fontWeight: 600, fontStyle: "italic" },
  rationale: { fontSize: 13, color: "var(--text-secondary)" },
  actions: { display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, alignItems: "stretch", width: 132 },

  evidenceBox: {
    marginTop: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
  },
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
  },
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    color: "var(--text-primary)",
    background: "var(--code-bg)",
  },

  footRow: { marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 },
  confidenceCol: { flex: 1, maxWidth: 260 },
  support: { fontSize: 12.5, color: "var(--text-muted)" },

  editForm: { display: "flex", flexDirection: "column", gap: 10, marginTop: 4 },
  editActions: { display: "flex", gap: 8, justifyContent: "flex-end" },
} satisfies Record<string, CSSProperties | ((...args: never[]) => CSSProperties)>;
