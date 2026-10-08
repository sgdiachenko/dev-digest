/**
 * Manifest selection and narrow extractors. Every extractor treats the file as
 * untrusted data: a hand-rolled, bounded scan (no eval, no shell), and any
 * failure yields `null` so the caller skips and counts the file (C7).
 */
import { MAX_FILE_BYTES, MAX_MANIFESTS, MAX_PACKAGE_DEPTH } from './constants.js';
import { basename, comparePath, inGeneratedDir, isExcluded } from './paths.js';
import type { TourTreeFile } from './types.js';

// ---- Selection --------------------------------------------------------------

const MANIFEST_NAMES = new Set([
  'package.json',
  'pnpm-workspace.yaml',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'go.work',
  'pom.xml',
  'settings.gradle',
  'settings.gradle.kts',
  'build.gradle',
  'build.gradle.kts',
  'composer.json',
  'Gemfile',
  'global.json',
  'Directory.Build.props',
]);

export type FileClass = 'manifest' | 'readme' | 'compose' | 'env_example';

const COMPOSE_RE = /^(?:docker-)?compose[^/]*\.ya?ml$/;
const README_RE = /^README(?:\.[A-Za-z]+)?$/i;
const ENV_EXAMPLE_NAMES = new Set(['.env.example', '.env.sample']);

export function classifyFile(path: string): FileClass | null {
  const name = basename(path);
  if (MANIFEST_NAMES.has(name) || name.endsWith('.csproj')) return 'manifest';
  if (README_RE.test(name)) return 'readme';
  if (COMPOSE_RE.test(name)) return 'compose';
  if (ENV_EXAMPLE_NAMES.has(name)) return 'env_example';
  return null;
}

function depthOf(path: string): number {
  return path.split('/').length - 1;
}

export interface FileSelection {
  /** Files the service must read, in path order. */
  files: TourTreeFile[];
  /** Files left unread because of the size cap or the manifest-count cap. */
  skipped: number;
}

/**
 * Which tree blobs to read: manifests (≤ 50, path order), READMEs, compose and
 * env-example files at repository or package level, each ≤ 512 KiB.
 */
export function selectFilesToRead(tree: readonly TourTreeFile[]): FileSelection {
  const sorted = [...tree].sort((a, b) => comparePath(a.path, b.path));
  const chosen: TourTreeFile[] = [];
  let skipped = 0;
  let manifests = 0;
  for (const file of sorted) {
    const kind = classifyFile(file.path);
    if (kind === null) continue;
    if (inGeneratedDir(file.path) || isExcluded(file.path)) continue;
    if (depthOf(file.path) > MAX_PACKAGE_DEPTH + 1) continue;
    if (file.size !== null && file.size > MAX_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    if (kind === 'manifest') {
      if (manifests >= MAX_MANIFESTS) {
        skipped += 1;
        continue;
      }
      manifests += 1;
    }
    chosen.push(file);
  }
  return { files: chosen, skipped };
}

// ---- Extractors -------------------------------------------------------------

function safe<T>(fn: () => T | null): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export interface PackageJsonFacts {
  name: string | null;
  scripts: Record<string, string>;
  main: string | null;
  bin: string[];
  exports: string[];
  workspaces: string[];
  dependencies: string[];
  packageManager: string | null;
}

export function parsePackageJson(text: string): PackageJsonFacts | null {
  return safe(() => {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw)) return null;
    const scripts: Record<string, string> = {};
    if (isRecord(raw.scripts)) {
      for (const [k, v] of Object.entries(raw.scripts)) if (typeof v === 'string') scripts[k] = v;
    }
    const bin =
      typeof raw.bin === 'string' ? [raw.bin] : isRecord(raw.bin) ? Object.values(raw.bin).filter((x): x is string => typeof x === 'string') : [];
    const exportsField = raw.exports;
    const exportPaths: string[] = [];
    const walk = (v: unknown, depth: number): void => {
      if (depth > 4) return;
      if (typeof v === 'string') exportPaths.push(v);
      else if (isRecord(v)) for (const x of Object.values(v)) walk(x, depth + 1);
    };
    walk(exportsField, 0);
    const ws = Array.isArray(raw.workspaces)
      ? strings(raw.workspaces)
      : isRecord(raw.workspaces)
        ? strings(raw.workspaces.packages)
        : [];
    const deps = new Set<string>();
    for (const key of ['dependencies', 'devDependencies']) {
      const block = raw[key];
      if (isRecord(block)) for (const name of Object.keys(block)) deps.add(name);
    }
    return {
      name: typeof raw.name === 'string' ? raw.name : null,
      scripts,
      main: typeof raw.main === 'string' ? raw.main : null,
      bin,
      exports: exportPaths,
      workspaces: ws,
      dependencies: [...deps].sort(comparePath),
      packageManager: typeof raw.packageManager === 'string' ? raw.packageManager : null,
    };
  });
}

function unquote(s: string): string {
  return s.trim().replace(/^['"]|['"]$/g, '');
}

export function parsePnpmWorkspace(text: string): { packages: string[] } | null {
  return safe(() => {
    const packages: string[] = [];
    let inPackages = false;
    for (const line of text.split(/\r?\n/)) {
      if (/^\S/.test(line)) inPackages = /^packages\s*:/.test(line);
      else if (inPackages) {
        const m = /^\s*-\s*(.+?)\s*(?:#.*)?$/.exec(line);
        if (m?.[1]) packages.push(unquote(m[1]));
      }
    }
    return { packages };
  });
}

function sectionLines(text: string): Array<{ section: string; line: string }> {
  const out: Array<{ section: string; line: string }> = [];
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const h = /^\[+\s*([^\]]+?)\s*\]+$/.exec(line);
    if (h?.[1]) {
      section = h[1];
      continue;
    }
    out.push({ section, line });
  }
  return out;
}

export interface PyprojectFacts {
  name: string | null;
  scriptTargets: string[];
  frameworks: string[];
}

const PY_FRAMEWORKS = ['django', 'fastapi', 'flask'];

export function parsePyproject(text: string): PyprojectFacts | null {
  return safe(() => {
    const lines = sectionLines(text);
    let name: string | null = null;
    const targets: string[] = [];
    const frameworks = new Set<string>();
    for (const { section, line } of lines) {
      if (section === 'project' && name === null) {
        const m = /^name\s*=\s*["']([^"']+)["']/.exec(line);
        if (m?.[1]) name = m[1];
      }
      if (section === 'project.scripts' || section === 'tool.poetry.scripts') {
        const m = /=\s*["']([^"']+)["']/.exec(line);
        if (m?.[1]) targets.push(m[1]);
      }
      if (/dependencies/.test(section) || section === 'project') {
        const lower = line.toLowerCase();
        for (const fw of PY_FRAMEWORKS) {
          if (new RegExp(`(^|[^a-z0-9_-])${fw}([^a-z0-9_-]|$)`).test(lower)) frameworks.add(fw);
        }
      }
    }
    return { name, scriptTargets: targets, frameworks: [...frameworks].sort(comparePath) };
  });
}

export interface CargoFacts {
  name: string | null;
  members: string[];
  hasWorkspace: boolean;
}

export function parseCargoToml(text: string): CargoFacts | null {
  return safe(() => {
    let name: string | null = null;
    let hasWorkspace = false;
    const members: string[] = [];
    let inMembers = false;
    for (const { section, line } of sectionLines(text)) {
      if (section === 'package' && name === null) {
        const m = /^name\s*=\s*["']([^"']+)["']/.exec(line);
        if (m?.[1]) name = m[1];
      }
      if (section === 'workspace') {
        hasWorkspace = true;
        if (/^members\s*=/.test(line)) inMembers = true;
        if (inMembers) {
          for (const m of line.matchAll(/["']([^"']+)["']/g)) if (m[1]) members.push(m[1]);
          if (line.includes(']')) inMembers = false;
        }
      }
    }
    return { name, members, hasWorkspace };
  });
}

export function parseGoMod(text: string): { module: string | null } | null {
  return safe(() => {
    const m = /^\s*module\s+(\S+)/m.exec(text);
    return { module: m?.[1] ?? null };
  });
}

export function parseGoWork(text: string): { uses: string[] } | null {
  return safe(() => {
    const uses: string[] = [];
    let inBlock = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      if (line === '') continue;
      if (inBlock) {
        if (line === ')') inBlock = false;
        else uses.push(unquote(line));
        continue;
      }
      if (/^use\s*\(\s*$/.test(line)) inBlock = true;
      else {
        const m = /^use\s+(\S+)/.exec(line);
        if (m?.[1]) uses.push(unquote(m[1]));
      }
    }
    return { uses };
  });
}

export interface PomFacts {
  artifactId: string | null;
  modules: string[];
  springBoot: boolean;
}

export function parsePomXml(text: string): PomFacts | null {
  return safe(() => {
    if (!/<project[\s>]/.test(text)) return null;
    const modules = [...text.matchAll(/<module>\s*([^<\s][^<]*?)\s*<\/module>/g)].map((m) => m[1] ?? '');
    const artifact = /<artifactId>\s*([^<]+?)\s*<\/artifactId>/.exec(text);
    return {
      artifactId: artifact?.[1] ?? null,
      modules: modules.filter((m) => m !== ''),
      springBoot: text.includes('spring-boot'),
    };
  });
}

export interface GradleFacts {
  includes: string[];
}

export function parseSettingsGradle(text: string): GradleFacts | null {
  return safe(() => {
    const includes: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (!/^\s*include\b/.test(line)) continue;
      for (const m of line.matchAll(/["']:?([^"']+)["']/g)) if (m[1]) includes.push(m[1].replace(/:/g, '/'));
    }
    return { includes };
  });
}

export function parseBuildGradle(text: string): { springBoot: boolean } | null {
  return safe(() => ({ springBoot: text.includes('org.springframework.boot') }));
}

export interface CsprojFacts {
  sdk: boolean;
  executable: boolean;
  buildHooks: string[];
}

export function parseCsproj(text: string): CsprojFacts | null {
  return safe(() => {
    if (!/<Project[\s>]/.test(text)) return null;
    const hooks: string[] = [];
    for (const m of text.matchAll(/<Target\b[^>]*\bName\s*=\s*["'](PreBuild|PostBuild)["'][^>]*>([\s\S]*?)<\/Target>/g)) {
      if (m[1] && /<Exec\b/.test(m[2] ?? '')) hooks.push(m[1]);
    }
    return {
      sdk: /<Project\b[^>]*\bSdk\s*=/.test(text),
      executable: /<OutputType>\s*(?:Exe|WinExe)\s*<\/OutputType>/.test(text),
      buildHooks: [...new Set(hooks)].sort(comparePath),
    };
  });
}

export interface ComposerFacts {
  name: string | null;
  scripts: string[];
  bin: string[];
  require: string[];
}

export function parseComposerJson(text: string): ComposerFacts | null {
  return safe(() => {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw)) return null;
    return {
      name: typeof raw.name === 'string' ? raw.name : null,
      scripts: isRecord(raw.scripts) ? Object.keys(raw.scripts).sort(comparePath) : [],
      bin: strings(raw.bin),
      require: isRecord(raw.require) ? Object.keys(raw.require).sort(comparePath) : [],
    };
  });
}

export function parseGemfile(text: string): { gems: string[] } | null {
  return safe(() => {
    const gems: string[] = [];
    for (const m of text.matchAll(/^\s*gem\s+["']([^"']+)["']/gm)) if (m[1]) gems.push(m[1]);
    return { gems };
  });
}

// ---- Dispatch ---------------------------------------------------------------

export type ParsedManifest =
  | { kind: 'package_json'; data: PackageJsonFacts }
  | { kind: 'pnpm_workspace'; data: { packages: string[] } }
  | { kind: 'pyproject'; data: PyprojectFacts }
  | { kind: 'cargo'; data: CargoFacts }
  | { kind: 'go_mod'; data: { module: string | null } }
  | { kind: 'go_work'; data: { uses: string[] } }
  | { kind: 'pom'; data: PomFacts }
  | { kind: 'settings_gradle'; data: GradleFacts }
  | { kind: 'build_gradle'; data: { springBoot: boolean } }
  | { kind: 'csproj'; data: CsprojFacts }
  | { kind: 'composer'; data: ComposerFacts }
  | { kind: 'gemfile'; data: { gems: string[] } }
  | { kind: 'marker'; data: Record<string, never> };

/**
 * Parses one manifest by file name. `undefined` = not a manifest we parse
 * (e.g. `global.json`, which only counts as a stack marker); `null` = parse
 * failed, to be skipped and counted.
 */
export function parseManifest(path: string, text: string): ParsedManifest | null | undefined {
  const name = basename(path);
  const wrap = <K extends ParsedManifest['kind'], D>(kind: K, data: D | null) =>
    data === null ? null : ({ kind, data } as unknown as ParsedManifest);
  if (name === 'package.json') return wrap('package_json', parsePackageJson(text));
  if (name === 'pnpm-workspace.yaml') return wrap('pnpm_workspace', parsePnpmWorkspace(text));
  if (name === 'pyproject.toml') return wrap('pyproject', parsePyproject(text));
  if (name === 'Cargo.toml') return wrap('cargo', parseCargoToml(text));
  if (name === 'go.mod') return wrap('go_mod', parseGoMod(text));
  if (name === 'go.work') return wrap('go_work', parseGoWork(text));
  if (name === 'pom.xml') return wrap('pom', parsePomXml(text));
  if (name === 'settings.gradle' || name === 'settings.gradle.kts') return wrap('settings_gradle', parseSettingsGradle(text));
  if (name === 'build.gradle' || name === 'build.gradle.kts') return wrap('build_gradle', parseBuildGradle(text));
  if (name.endsWith('.csproj')) return wrap('csproj', parseCsproj(text));
  if (name === 'composer.json') return wrap('composer', parseComposerJson(text));
  if (name === 'Gemfile') return wrap('gemfile', parseGemfile(text));
  return undefined;
}
