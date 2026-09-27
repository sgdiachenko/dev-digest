/* BlastSymbolGraph — one changed symbol's downstream impact as a 3-column
   node-link graph: symbol → callers (deduped by name, E2) → endpoints/crons
   they reach. HTML nodes over a background SVG that draws only the
   connecting lines (E3) — no graph/force-layout library. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { layoutGraph, type GraphNode } from "./helpers";
import { s } from "./styles";

function NodeBadge({ node }: { node: GraphNode }) {
  const accented = node.kind === "symbol" || node.kind === "endpoint";
  const cron = node.kind === "cron";
  const color = cron ? "var(--warn)" : accented ? "var(--accent-text)" : "var(--text-secondary)";
  const bg = cron ? "var(--warn-bg)" : accented ? "var(--accent-bg)" : "var(--bg-elevated)";
  return (
    <div style={{ ...s.nodeWrap, left: node.x, top: node.y }}>
      <Badge
        mono
        color={color}
        bg={bg}
        style={{ border: `1px solid ${cron ? "var(--warn)" : accented ? "var(--accent)" : "var(--border)"}` }}
      >
        {node.label}
      </Badge>
    </div>
  );
}

export function BlastSymbolGraph({ group }: { group: DownstreamImpact }) {
  const t = useTranslations("blast");
  const layout = layoutGraph(group);

  return (
    <div style={{ ...s.container, height: layout.height, minWidth: layout.width }}>
      <svg width={layout.width} height={layout.height} style={s.svg} aria-label={t("graph.ariaLabel")}>
        {layout.edges.map((edge) => (
          <line
            key={edge.id}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
        ))}
      </svg>
      {layout.nodes.map((node) => (
        <NodeBadge key={node.id} node={node} />
      ))}
    </div>
  );
}
