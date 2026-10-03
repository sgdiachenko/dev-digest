import type { OnboardingCommand, OnboardingCommandGroup, OnboardingRunLocally } from '@devdigest/shared';
import {
  MAX_COMMANDS_PER_GROUP,
  MAX_PACKAGE_GROUPS,
  PHASE_ORDER,
  REMOTE_CODE_DETAIL,
} from './constants.js';
import type { PackageInfo, RawCommand } from './ecosystems.js';
import { envNames } from './env-example.js';
import { comparePath, dirname } from './paths.js';
import { classifyFile } from './manifests.js';
import { detectRemoteCode, parseReadme } from './readme.js';
import type { TourPhase, TourReadFile } from './types.js';

export interface RunLocallyInput {
  packages: readonly PackageInfo[];
  /** Tree paths (for compose files, which are never read). */
  paths: readonly string[];
  /** Read README and env-example files. */
  files: readonly TourReadFile[];
}

interface Candidate extends RawCommand {
  env_names: string[] | null;
  /** -1 env/compose (before scripts that need them), 0 manifest, 2 README: stable order inside a phase. */
  rank: number;
}

const README_PHASES: Array<[RegExp, TourPhase]> = [
  [/\bcp\b[^\n]*\.env|^\s*(?:export|source)\s/, 'environment'],
  [/\b(?:docker|docker-compose|compose|supabase|kubectl|minikube)\b/, 'infrastructure'],
  [/\b(?:install|bundle|pip3?|poetry|npm ci|yarn|pnpm i)\b/, 'install'],
  [/\b(?:test|pytest|jest|vitest|spec)\b/, 'test'],
];

function readmePhase(command: string): TourPhase {
  for (const [re, phase] of README_PHASES) if (re.test(command)) return phase;
  return 'dev';
}

function relativeTo(dir: string, path: string): string {
  return dir === '.' ? path : path.slice(dir.length + 1);
}

function ownerDir(dirs: readonly string[], path: string): string {
  let best = '.';
  for (const d of dirs) {
    if (d !== '.' && path.startsWith(`${d}/`) && d.length > best.length) best = d;
  }
  return best;
}

export function buildRunLocally(input: RunLocallyInput): OnboardingRunLocally {
  const dirs = input.packages.map((p) => p.path);
  const byDir = new Map<string, Candidate[]>();
  const push = (dir: string, c: Candidate): void => {
    const list = byDir.get(dir) ?? [];
    list.push(c);
    byDir.set(dir, list);
  };
  for (const pkg of input.packages) {
    for (const c of pkg.commands) push(pkg.path, { ...c, env_names: null, rank: 0 });
  }

  const sortedFiles = [...input.files].sort((a, b) => comparePath(a.path, b.path));
  for (const file of sortedFiles) {
    const kind = classifyFile(file.path);
    if (kind === 'env_example') {
      const dir = ownerDir(dirs, file.path);
      const local = relativeTo(dir, file.path);
      push(dir, {
        phase: 'environment',
        command: `cp ${local} ${dirname(local) === '.' ? '' : `${dirname(local)}/`}.env`,
        source_path: file.path,
        source_key: null,
        by_convention: true,
        hooks: [],
        env_names: envNames(file.text),
        rank: -1,
      });
    } else if (kind === 'readme') {
      const dir = dirname(file.path);
      const group = dirs.includes(dir) || dir === '.' ? dir : ownerDir(dirs, file.path);
      for (const rc of parseReadme(file.text).commands) {
        push(group, {
          phase: readmePhase(rc.command),
          command: rc.command,
          source_path: file.path,
          source_key: rc.heading === '' ? null : rc.heading,
          by_convention: false,
          hooks: [],
          env_names: null,
          rank: 2,
        });
      }
    }
  }
  for (const path of [...input.paths].sort(comparePath)) {
    if (classifyFile(path) !== 'compose') continue;
    const dir = ownerDir(dirs, path);
    const local = relativeTo(dir, path);
    push(dir, {
      phase: 'infrastructure',
      command: /^(?:docker-)?compose\.ya?ml$/.test(local)
        ? 'docker compose up -d'
        : `docker compose -f ${local} up -d`,
      source_path: path,
      source_key: null,
      by_convention: true,
      hooks: [],
      env_names: null,
      rank: -1,
    });
  }

  const groups: OnboardingCommandGroup[] = [];
  const fileCounts = new Map(input.packages.map((p) => [p.path, p.fileCount] as const));
  const ecosystems = new Map(input.packages.map((p) => [p.path, p.ecosystems[0] ?? null] as const));
  const nonRoot = [...byDir.keys()]
    .filter((d) => d !== '.')
    .sort((a, b) => (fileCounts.get(b) ?? 0) - (fileCounts.get(a) ?? 0) || comparePath(a, b))
    .slice(0, MAX_PACKAGE_GROUPS);
  const order = (byDir.has('.') ? ['.'] : []).concat(nonRoot);

  for (const dir of order) {
    const candidates = byDir.get(dir) ?? [];
    const seen = new Set<string>();
    const unique = candidates.filter((c) => {
      const key = `${c.phase}\u0000${c.command}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const sorted = unique
      .map((c, i) => ({ c, i }))
      .sort(
        (a, b) =>
          PHASE_ORDER.indexOf(a.c.phase) - PHASE_ORDER.indexOf(b.c.phase) || a.c.rank - b.c.rank || a.i - b.i,
      )
      .map((x) => x.c)
      .slice(0, MAX_COMMANDS_PER_GROUP);
    if (sorted.length === 0) continue;

    const perPhase = new Map<TourPhase, number>();
    const commands: OnboardingCommand[] = sorted.map((c, i) => {
      const n = (perPhase.get(c.phase) ?? 0) + 1;
      perPhase.set(c.phase, n);
      const warnings: OnboardingCommand['warnings'] = c.hooks.map((h) => ({
        kind: 'lifecycle_hook' as const,
        detail: h,
      }));
      if (detectRemoteCode(c.command) || (c.inspect !== undefined && detectRemoteCode(c.inspect))) {
        warnings.push({ kind: 'remote_code', detail: REMOTE_CODE_DETAIL });
      }
      return {
        id: `${dir}#${c.phase}#${n}`,
        position: i + 1,
        phase: c.phase,
        command: c.command,
        source_path: c.source_path,
        source_key: c.source_key,
        by_convention: c.by_convention,
        env_names: c.env_names,
        warnings,
      };
    });
    groups.push({ package_path: dir, ecosystem: ecosystems.get(dir) ?? null, commands });
  }
  return { origin: 'facts', groups };
}
