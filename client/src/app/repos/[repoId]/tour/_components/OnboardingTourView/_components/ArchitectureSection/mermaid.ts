import type { OnboardingDiagram } from "@/lib/types";

/** Mermaid entity codes for characters that could break out of a quoted label. */
function escapeLabel(text: string): string {
  return text.replace(/["#&<>\\|\r\n]/g, (c) => `#${c.charCodeAt(0)};`);
}

/**
 * Builds a flowchart from the module graph. Node ids are generated (`n0`, `n1`, …) — repository
 * text only ever appears inside an escaped, quoted label. Fewer than 2 nodes, or no edge between
 * known nodes → null: a column of unconnected boxes says nothing the modules list doesn't.
 */
export function toMermaid(diagram: OnboardingDiagram): string | null {
  if (diagram.nodes.length < 2) return null;
  const ids = new Map<string, string>();
  const known = new Set(diagram.nodes.map((n) => n.id));
  if (!diagram.edges.some((e) => known.has(e.from) && known.has(e.to))) return null;
  const lines = ["flowchart LR"];
  diagram.nodes.forEach((node, i) => {
    ids.set(node.id, `n${i}`);
    lines.push(`  n${i}["${escapeLabel(node.path)}"]`);
  });
  for (const e of diagram.edges) {
    const from = ids.get(e.from);
    const to = ids.get(e.to);
    if (from && to) lines.push(`  ${from} -->|${e.import_count}| ${to}`);
  }
  return lines.join("\n");
}
