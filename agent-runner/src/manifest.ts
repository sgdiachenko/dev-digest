import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { RunnerError } from './errors.js';
import { sha256Hex } from './hash.js';

/**
 * Every `.devdigest/agents/*.yaml` of the checkout is one agent (AC-118). The
 * manifest is untrusted on-disk content (a PR can edit it, AC-168): it is
 * `safeParse`d with the SAME `AgentManifest` schema the studio writes it with
 * before any field is used (AC-52). `post_as` comes from this manifest only
 * (AC-152); a manifest without a valid `post_as` is invalid (AC-151).
 */

export interface ManifestFile {
  /** File name without `.yaml` — names the agent's artifact directory. */
  slug: string;
  path: string;
}

export type LoadedManifest =
  | { ok: true; manifest: AgentManifest; sha256: string }
  | { ok: false; message: string };

/** List `<devdigestDir>/agents/*.yaml`, sorted by name. */
export function listManifests(devdigestDir: string): ManifestFile[] {
  const agentsDir = path.join(devdigestDir, 'agents');
  let entries: string[];
  try {
    entries = readdirSync(agentsDir);
  } catch (err) {
    throw new RunnerError(`Agent manifest directory not found: ${agentsDir} (${(err as Error).message})`);
  }
  return entries
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => ({ slug: f.slice(0, -'.yaml'.length), path: path.join(agentsDir, f) }));
}

/**
 * Read + validate one manifest. The sha256 is returned only for a manifest that
 * was read AND validated (AC-173, EC-33): an unreadable or invalid file yields
 * no hash, so its run never shows a "differs from export" marker.
 */
export function loadManifest(manifestPath: string): LoadedManifest {
  let bytes: Buffer;
  try {
    bytes = readFileSync(manifestPath);
  } catch (err) {
    return { ok: false, message: `cannot read manifest: ${(err as Error).message}` };
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(bytes.toString('utf8'));
  } catch (err) {
    return { ok: false, message: `manifest is not valid YAML: ${(err as Error).message}` };
  }
  const result = AgentManifest.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return { ok: false, message: `manifest failed validation: ${issues}` };
  }
  return { ok: true, manifest: result.data, sha256: sha256Hex(bytes) };
}
