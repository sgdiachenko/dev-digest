import { MAX_DIAGRAM_NODES } from './constants.js';

const MAX_SRC_CHARS = 4000;
const FORBIDDEN_LINE = /^\s*(click|%%\{)/i;
const SKIP_LINE = /^\s*(%%|subgraph\b|end\b|classDef\b|class\b|style\b|linkStyle\b|direction\b)/i;

/** Count distinct node ids in a flowchart body (labels and arrows stripped). */
function countNodes(body: string): number {
  const ids = new Set<string>();
  for (const rawLine of body.split(/[\n;]/)) {
    if (SKIP_LINE.test(rawLine)) continue;
    const line = rawLine
      .replace(/"[^"]*"/g, '')
      .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, '')
      .replace(/\|[^|]*\|/g, '')
      .replace(/(?:--|==|-\.)\s+[^\n]*?\s+(?:-->|---|==>|-\.->)/g, ' & ')
      .replace(/[-=.]+[>ox]?/g, ' & ')
      .replace(/<|>/g, ' ');
    for (const tok of line.split(/[\s&]+/)) {
      if (/^[A-Za-z_][\w]*$/.test(tok)) ids.add(tok);
    }
  }
  return ids.size;
}

/**
 * Accepts only a `flowchart`/`graph` diagram of at most MAX_DIAGRAM_NODES
 * nodes, with no interaction/init directives. Returns the trimmed source or
 * null (the section then renders without a diagram).
 */
export function checkFlowchart(src: string | null | undefined): string | null {
  if (typeof src !== 'string') return null;
  const text = src.trim();
  if (text === '' || text.length > MAX_SRC_CHARS || text.includes('```')) return null;
  const lines = text.split('\n');
  if (!/^(flowchart|graph)(\s|$)/i.test(lines[0]!.trim())) return null;
  if (lines.some((l) => FORBIDDEN_LINE.test(l))) return null;
  const first = lines[0]!.trim().replace(/^(flowchart|graph)\s*(TB|TD|BT|RL|LR)?\s*;?/i, '');
  const body = [first, ...lines.slice(1)].join('\n');
  const n = countNodes(body);
  if (n === 0 || n > MAX_DIAGRAM_NODES) return null;
  return text;
}
