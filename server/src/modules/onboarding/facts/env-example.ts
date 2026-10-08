/**
 * Env-example files: variable NAMES only. The value side of every line is
 * discarded here, so a value can never reach the response, logs or export (C8).
 */
import { comparePath } from './paths.js';

export function envNames(text: string): string[] {
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m?.[1]) names.add(m[1]);
  }
  return [...names].sort(comparePath);
}
