/**
 * D1 — the Smart Diff classifier: a pure function from a changed file's path
 * to its `SmartDiffRole`. No HTTP, no DB, no network — importable on its own.
 */
import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES } from './constants.js';

/** `\` → `/`, and strip a leading `./`. */
function normalize(path: string): string {
  const slashed = path.replace(/\\/g, '/');
  return slashed.startsWith('./') ? slashed.slice(2) : slashed;
}

/**
 * Classify one file path into a Smart Diff role. The first rule in
 * `CLASSIFY_RULES` that matches wins; a path matching none of them is `core`.
 */
export function classifyFile(path: string): SmartDiffRole {
  const normalized = normalize(path);
  for (const rule of CLASSIFY_RULES) {
    if (rule.test(normalized)) return rule.role;
  }
  return 'core';
}
