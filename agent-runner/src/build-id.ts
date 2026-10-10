import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CI_PATHS } from '@devdigest/shared';
import { sha256Hex } from './hash.js';

/** Value used when the shipped runner files cannot be read (e.g. running from source). */
export const UNKNOWN_RUNNER_BUILD = 'unknown';

/**
 * Runner build identifier (AC-174, AC-175): sha256 over the bytes of the
 * shipped runner files, in `CI_PATHS.RUNNER_FILES` order, read from `dir`
 * (the directory the running bundle lives in). Computed at runtime, so it is
 * the same for every run of one bundle and differs between different bundles.
 */
export function computeRunnerBuild(dir: string): string {
  try {
    return sha256Hex(...CI_PATHS.RUNNER_FILES.map((f) => readFileSync(path.join(dir, f))));
  } catch {
    return UNKNOWN_RUNNER_BUILD;
  }
}
