import type { DownstreamImpact } from "@devdigest/shared";

/* layoutGraph — pure 3-column node-link layout (E3): changed symbol → callers
   → endpoints/crons. HTML nodes are drawn on top of a plain SVG that only
   draws the connecting lines (no graph library, no force layout — this repo's
   charts are all hand-rolled SVG, see client/src/vendor/ui/charts). */

export interface GraphNode {
  id: string;
  label: string;
  kind: "symbol" | "caller" | "endpoint" | "cron";
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

const COL_X = { symbol: 16, caller: 200, target: 400 } as const;
const ROW_HEIGHT = 36;
const TOP_PADDING = 20;
const NODE_COL_WIDTH = 180;

interface CallerNode {
  name: string;
  targets: Array<{ name: string; kind: "endpoint" | "cron" }>;
}

/** E2 — dedup caller rows by `name` (the contract keeps one row per
 *  `file:line`, Tree view needs that); union each caller's own
 *  endpoints/crons into one graph node. */
function dedupCallers(group: DownstreamImpact): CallerNode[] {
  const byName = new Map<string, Map<string, "endpoint" | "cron">>();
  for (const c of group.callers) {
    const existing = byName.get(c.name) ?? new Map<string, "endpoint" | "cron">();
    for (const e of c.endpoints_affected) existing.set(e, "endpoint");
    for (const cr of c.crons_affected) existing.set(cr, "cron");
    byName.set(c.name, existing);
  }
  return [...byName.entries()].map(([name, targets]) => ({
    name,
    targets: [...targets.entries()].map(([targetName, kind]) => ({ name: targetName, kind })),
  }));
}

/** Evenly spaced row position within `[TOP_PADDING, height - TOP_PADDING]`;
 *  a single row centers on the column's midpoint. */
function rowY(index: number, count: number, height: number): number {
  if (count <= 1) return height / 2;
  const usable = height - TOP_PADDING * 2;
  return TOP_PADDING + (usable * index) / (count - 1);
}

export function layoutGraph(group: DownstreamImpact): GraphLayout {
  const callers = dedupCallers(group);
  const targets = [...new Map(
    callers.flatMap((c) => c.targets).map((target) => [`${target.kind}:${target.name}`, target]),
  ).values()];

  const rowCount = Math.max(callers.length, targets.length, 1);
  const height = rowCount * ROW_HEIGHT + TOP_PADDING * 2;
  const width = COL_X.target + NODE_COL_WIDTH;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const callerY = new Map<string, number>();
  const targetY = new Map<string, number>();

  const symbolId = `symbol:${group.symbol}`;
  const symbolY = height / 2;
  nodes.push({ id: symbolId, label: group.symbol, kind: "symbol", x: COL_X.symbol, y: symbolY });

  callers.forEach((c, i) => {
    const y = rowY(i, callers.length, height);
    callerY.set(c.name, y);
    const id = `caller:${c.name}`;
    nodes.push({ id, label: c.name, kind: "caller", x: COL_X.caller, y });
    edges.push({ id: `${symbolId}->${id}`, x1: COL_X.symbol, y1: symbolY, x2: COL_X.caller, y2: y });
  });

  targets.forEach((target, i) => {
    const y = rowY(i, targets.length, height);
    targetY.set(`${target.kind}:${target.name}`, y);
    nodes.push({ id: `${target.kind}:${target.name}`, label: target.name, kind: target.kind, x: COL_X.target, y });
  });

  for (const c of callers) {
    const cId = `caller:${c.name}`;
    const cy = callerY.get(c.name)!;
    for (const target of c.targets) {
      const targetId = `${target.kind}:${target.name}`;
      const ty = targetY.get(targetId)!;
      edges.push({ id: `${cId}->${targetId}`, x1: COL_X.caller, y1: cy, x2: COL_X.target, y2: ty });
    }
  }

  return { nodes, edges, width, height };
}
