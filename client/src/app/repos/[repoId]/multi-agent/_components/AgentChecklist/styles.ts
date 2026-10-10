import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8 },
  card: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "solid",
  },
  dimmed: { opacity: 0.55 },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  body: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 },
  name: { display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },
  tag: { fontSize: 11, fontWeight: 400, color: "var(--text-muted)", flexShrink: 0 },
  description: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.4,
    color: "var(--text-muted)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  estimate: { fontSize: 12, fontFamily: "var(--font-mono, monospace)", color: "var(--text-muted)", flexShrink: 0 },
  skeletons: { display: "flex", flexDirection: "column", gap: 8 },
} satisfies Record<string, CSSProperties>;
