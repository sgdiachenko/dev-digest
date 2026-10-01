/**
 * Appendix A ecosystem rules: stack evidence, packages (monorepo rule), entry
 * points and command candidates. V rows produce `verified` stack entries; U
 * rows produce `convention` ones and `by_convention` commands (AC-22). Nothing
 * here executes or evaluates repository content (C6).
 */
import type { CriticalTag, OnboardingStackEntry } from '@devdigest/shared';
import { LIFECYCLE_HOOKS, MAX_PACKAGE_DEPTH } from './constants.js';
import {
  classifyFile,
  parseManifest,
  type ParsedManifest,
  type PackageJsonFacts,
} from './manifests.js';
import { basename, comparePath, dirname, inGeneratedDir } from './paths.js';
import type { TourGrepHits, TourPhase, TourReadFile } from './types.js';

export interface RawCommand {
  phase: TourPhase;
  command: string;
  source_path: string | null;
  source_key: string | null;
  by_convention: boolean;
  /** Lifecycle / build hooks that this command triggers (AC-25). */
  hooks: string[];
  /** Extra text scanned for remote-code pipes (e.g. an npm script body). */
  inspect?: string;
}

export interface PackageInfo {
  /** Directory relative to the repo root; `'.'` for the root. */
  path: string;
  ecosystems: string[];
  commands: RawCommand[];
  fileCount: number;
}

export interface TaggedFile {
  path: string;
  tag: CriticalTag;
}

export interface EcosystemFacts {
  stack: OnboardingStackEntry[];
  packages: PackageInfo[];
  entryPoints: string[];
  tagged: TaggedFile[];
  /** Workspace members (directories), when a root workspace marker exists. */
  memberDirs: string[];
  hasWorkspaceMarker: boolean;
  /** Manifests whose extractor failed. */
  skippedParse: number;
}

export interface EcosystemInput {
  paths: readonly string[];
  files: readonly TourReadFile[];
  grep: TourGrepHits;
}

// ---- Script classification ---------------------------------------------------

const DEV_SCRIPTS = new Set(['dev', 'start', 'serve', 'start:dev']);

/** Phase of a manifest script by its name, or null when it is not run-relevant. */
export function classifyScript(name: string): TourPhase | null {
  if (name === 'setup' || name === 'bootstrap') return 'install';
  if (/^(db|migrate|seed)([:-].+)?$/.test(name)) return 'infrastructure';
  if (DEV_SCRIPTS.has(name)) return 'dev';
  if (name === 'test') return 'test';
  return null;
}

// ---- Glob membership (segment matcher, no RegExp from untrusted text) ---------

function matchSegment(pattern: string, seg: string): boolean {
  if (!pattern.includes('*')) return pattern === seg;
  const parts = pattern.split('*');
  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';
  if (!seg.startsWith(first) || !seg.endsWith(last) || seg.length < first.length + last.length) return false;
  let pos = first.length;
  const end = seg.length - last.length;
  for (const mid of parts.slice(1, -1)) {
    const at = seg.indexOf(mid, pos);
    if (at < 0 || at + mid.length > end) return false;
    pos = at + mid.length;
  }
  return true;
}

/**
 * Glob match over path segments. Patterns come from untrusted manifests, so the search is memoised on
 * (pattern index, segment index): each state is explored once, which bounds the work at
 * |pattern| x |segments| instead of the exponential backtracking of nested `**`.
 */
function matchSegments(pat: string[], segs: string[]): boolean {
  const failed = new Set<number>();
  const width = segs.length + 1;
  const go = (pi: number, si: number): boolean => {
    if (pi === pat.length) return si === segs.length;
    const state = pi * width + si;
    if (failed.has(state)) return false;
    const p = pat[pi] ?? '';
    let ok = false;
    if (p === '**') {
      for (let k = si; k <= segs.length && !ok; k += 1) ok = go(pi + 1, k);
    } else {
      ok = si < segs.length && matchSegment(p, segs[si] ?? '') && go(pi + 1, si + 1);
    }
    if (!ok) failed.add(state);
    return ok;
  };
  return go(0, 0);
}

function normalizePattern(p: string): string {
  return p.replace(/^\.\//, '').replace(/\/+$/, '');
}

export function globMatchesDir(pattern: string, dir: string): boolean {
  const norm = normalizePattern(pattern);
  if (norm === '' || norm.length > 200 || norm.startsWith('!')) return false;
  // `**/**` is `**`: collapse runs so the pattern length cannot be spent on repeats.
  const pat = norm.split('/').filter((seg, i, all) => !(seg === '**' && all[i - 1] === '**'));
  return matchSegments(pat, dir.split('/'));
}

// ---- Detection ---------------------------------------------------------------

interface Located {
  path: string;
  dir: string;
  parsed: ParsedManifest;
}

const PACKAGE_DEFINING = new Set<ParsedManifest['kind']>([
  'package_json',
  'pyproject',
  'cargo',
  'go_mod',
  'pom',
  'settings_gradle',
  'build_gradle',
  'csproj',
  'composer',
  'gemfile',
]);

function joinPath(dir: string, rel: string): string {
  const clean = rel.replace(/^\.\//, '');
  return dir === '.' ? clean : `${dir}/${clean}`;
}

function underDir(path: string, dir: string): boolean {
  return dir === '.' || path.startsWith(`${dir}/`);
}

function sortedUnique(items: Iterable<string>): string[] {
  return [...new Set(items)].sort(comparePath);
}

function jsRunner(pm: string, name: string): string {
  return pm === 'npm' || pm === 'bun' ? `${pm} run ${name}` : `${pm} ${name}`;
}

interface PmInfo {
  pm: string;
  lockPath: string | null;
  verified: boolean;
}

function detectPackageManager(
  dir: string,
  pathSet: ReadonlySet<string>,
  pkg: PackageJsonFacts,
): PmInfo {
  const locks: Array<[string, string, boolean]> = [
    ['pnpm-lock.yaml', 'pnpm', true],
    ['package-lock.json', 'npm', true],
    ['yarn.lock', 'yarn', false],
    ['bun.lockb', 'bun', false],
    ['bun.lock', 'bun', false],
  ];
  for (const base of dir === '.' ? ['.'] : [dir, '.']) {
    for (const [file, pm, verified] of locks) {
      const p = joinPath(base, file);
      if (pathSet.has(p)) return { pm, lockPath: p, verified };
    }
  }
  const declared = /^(pnpm|npm|yarn|bun)@/.exec(pkg.packageManager ?? '')?.[1];
  if (declared) return { pm: declared, lockPath: null, verified: false };
  return { pm: 'npm', lockPath: null, verified: false };
}

export function detectEcosystems(input: EcosystemInput): EcosystemFacts {
  const paths = [...input.paths].filter((p) => !inGeneratedDir(p)).sort(comparePath);
  const pathSet = new Set(paths);
  let skippedParse = 0;

  // 1. Parse manifests.
  const located: Located[] = [];
  for (const file of [...input.files].sort((a, b) => comparePath(a.path, b.path))) {
    if (classifyFile(file.path) !== 'manifest') continue;
    const parsed = parseManifest(file.path, file.text);
    if (parsed === undefined) continue;
    if (parsed === null) {
      skippedParse += 1;
      continue;
    }
    located.push({ path: file.path, dir: dirname(file.path), parsed });
  }

  // 2. Workspace markers (root manifests only).
  const manifestDirs = sortedUnique(
    located.filter((m) => PACKAGE_DEFINING.has(m.parsed.kind)).map((m) => m.dir),
  );
  const memberPatterns: string[] = [];
  let hasMarker = false;
  for (const m of located) {
    if (m.dir !== '.') continue;
    const d = m.parsed;
    if (d.kind === 'pnpm_workspace' || (d.kind === 'package_json' && d.data.workspaces.length > 0)) {
      hasMarker = true;
      memberPatterns.push(...(d.kind === 'pnpm_workspace' ? d.data.packages : d.data.workspaces));
    } else if (d.kind === 'cargo' && d.data.hasWorkspace) {
      hasMarker = true;
      memberPatterns.push(...d.data.members);
    } else if (d.kind === 'go_work') {
      hasMarker = true;
      memberPatterns.push(...d.data.uses);
    } else if (d.kind === 'pom' && d.data.modules.length > 0) {
      hasMarker = true;
      memberPatterns.push(...d.data.modules);
    } else if (d.kind === 'settings_gradle' && d.data.includes.length > 0) {
      hasMarker = true;
      memberPatterns.push(...d.data.includes);
    }
  }
  const memberDirs = sortedUnique(
    manifestDirs.filter((dir) => dir !== '.' && memberPatterns.some((p) => globMatchesDir(p, dir))),
  );

  // Python without a pyproject (Django): `manage.py` also defines a package.
  const managePys = paths.filter((p) => basename(p) === 'manage.py');
  const allDirs = sortedUnique([...manifestDirs, ...managePys.map(dirname)]);
  const withinDepth = (dir: string) => dir === '.' || dir.split('/').length <= MAX_PACKAGE_DEPTH;
  const packageDirs = hasMarker
    ? sortedUnique(['.', ...memberDirs].filter((d) => allDirs.includes(d)))
    : allDirs.filter(withinDepth);

  // 3. Per-package facts.
  const stack = new Map<string, OnboardingStackEntry>();
  const addStack = (e: OnboardingStackEntry): void => {
    const key = `${e.kind}:${e.name}`;
    if (!stack.has(key)) stack.set(key, e);
  };
  const entries = new Set<string>();
  const tagged: TaggedFile[] = [];
  const addEntry = (p: string): void => {
    if (pathSet.has(p)) entries.add(p);
  };
  const packages: PackageInfo[] = [];

  for (const dir of packageDirs) {
    const here = located.filter((m) => m.dir === dir);
    const ecosystems: string[] = [];
    const commands: RawCommand[] = [];
    const cmd = (c: RawCommand): void => {
      commands.push(c);
    };
    const eco = (name: string): void => {
      if (!ecosystems.includes(name)) ecosystems.push(name);
    };

    for (const { path, parsed } of here) {
      switch (parsed.kind) {
        case 'package_json': {
          const pkg = parsed.data;
          eco('JavaScript/TypeScript');
          addStack({ kind: 'ecosystem', name: 'JavaScript/TypeScript', evidence_path: path, confidence: 'verified' });
          const pm = detectPackageManager(dir, pathSet, pkg);
          addStack({
            kind: 'package_manager',
            name: pm.pm,
            evidence_path: pm.lockPath ?? path,
            confidence: pm.verified ? 'verified' : 'convention',
          });
          cmd({
            phase: 'install',
            command: `${pm.pm} install`,
            source_path: pm.lockPath ?? path,
            source_key: null,
            by_convention: !pm.verified,
            hooks: LIFECYCLE_HOOKS.filter((h) => h in pkg.scripts),
          });
          for (const name of Object.keys(pkg.scripts).sort(comparePath)) {
            const phase = classifyScript(name);
            if (phase === null) continue;
            cmd({
              phase,
              command: jsRunner(pm.pm, name),
              source_path: path,
              source_key: `scripts.${name}`,
              by_convention: false,
              hooks: [],
              inspect: pkg.scripts[name],
            });
          }
          for (const rel of [pkg.main, ...pkg.bin, ...pkg.exports]) {
            if (rel) addEntry(joinPath(dir, rel));
          }
          for (const base of ['index', 'main', 'server', 'app']) {
            for (const p of paths) {
              if (dirname(p) === joinPath(dir, 'src') && basename(p).startsWith(`${base}.`)) addEntry(p);
            }
          }
          break;
        }
        case 'pyproject': {
          eco('Python');
          addStack({ kind: 'ecosystem', name: 'Python', evidence_path: path, confidence: 'verified' });
          for (const target of parsed.data.scriptTargets) {
            const mod = (target.split(':')[0] ?? '').replace(/\./g, '/');
            if (mod === '') continue;
            addEntry(joinPath(dir, `${mod}.py`));
            addEntry(joinPath(dir, `src/${mod}.py`));
            addEntry(joinPath(dir, `${mod}/__init__.py`));
          }
          const appFile = ['main.py', 'app.py', 'app/main.py', 'src/main.py', 'src/app.py']
            .map((f) => joinPath(dir, f))
            .find((f) => pathSet.has(f));
          if (parsed.data.frameworks.includes('fastapi')) {
            addStack({ kind: 'framework', name: 'FastAPI', evidence_path: path, confidence: 'convention' });
            if (appFile) {
              addEntry(appFile);
              const mod = appFile.slice(dir === '.' ? 0 : dir.length + 1).replace(/\.py$/, '').replace(/\//g, '.');
              cmd({
                phase: 'dev',
                command: `uvicorn ${mod}:app --reload`,
                source_path: path,
                source_key: null,
                by_convention: true,
                hooks: [],
              });
            }
          }
          if (parsed.data.frameworks.includes('flask')) {
            addStack({ kind: 'framework', name: 'Flask', evidence_path: path, confidence: 'convention' });
            if (appFile) addEntry(appFile);
            cmd({ phase: 'dev', command: 'flask run', source_path: path, source_key: null, by_convention: true, hooks: [] });
          }
          break;
        }
        case 'cargo': {
          eco('Rust');
          addStack({ kind: 'ecosystem', name: 'Rust', evidence_path: path, confidence: 'verified' });
          for (const f of ['src/main.rs', 'src/lib.rs']) addEntry(joinPath(dir, f));
          const binDir = joinPath(dir, 'src/bin');
          for (const p of paths) if (dirname(p) === binDir && p.endsWith('.rs')) addEntry(p);
          cmd({ phase: 'dev', command: 'cargo run', source_path: path, source_key: null, by_convention: true, hooks: [] });
          cmd({ phase: 'test', command: 'cargo test', source_path: path, source_key: null, by_convention: true, hooks: [] });
          break;
        }
        case 'go_mod': {
          eco('Go');
          addStack({ kind: 'ecosystem', name: 'Go', evidence_path: path, confidence: 'verified' });
          const mains = input.grep.goMain.map((m) => m.path).filter((p) => underDir(p, dir) && pathSet.has(p));
          const runTargets = new Set<string>();
          for (const p of sortedUnique(mains)) {
            addEntry(p);
            const rel = dir === '.' ? p : p.slice(dir.length + 1);
            const m = /^cmd\/([^/]+)\//.exec(rel);
            runTargets.add(m?.[1] ? `./cmd/${m[1]}` : '.');
          }
          for (const target of [...runTargets].sort(comparePath)) {
            cmd({ phase: 'dev', command: `go run ${target}`, source_path: path, source_key: null, by_convention: true, hooks: [] });
          }
          cmd({ phase: 'test', command: 'go test ./...', source_path: path, source_key: null, by_convention: true, hooks: [] });
          break;
        }
        case 'pom': {
          eco('Java (Maven)');
          addStack({ kind: 'ecosystem', name: 'Java (Maven)', evidence_path: path, confidence: 'verified' });
          const apps = sortedUnique(input.grep.springApp.map((m) => m.path).filter((p) => underDir(p, dir) && pathSet.has(p)));
          for (const a of apps) addEntry(a);
          if (apps.length > 0 || parsed.data.springBoot) {
            addStack({ kind: 'framework', name: 'Spring Boot', evidence_path: apps[0] ?? path, confidence: 'verified' });
            cmd({ phase: 'dev', command: 'mvn spring-boot:run', source_path: path, source_key: null, by_convention: true, hooks: [] });
          }
          cmd({ phase: 'test', command: 'mvn test', source_path: path, source_key: null, by_convention: true, hooks: [] });
          break;
        }
        case 'settings_gradle':
        case 'build_gradle': {
          eco('Java/Kotlin (Gradle)');
          addStack({ kind: 'ecosystem', name: 'Java/Kotlin (Gradle)', evidence_path: path, confidence: 'verified' });
          const apps = sortedUnique(input.grep.springApp.map((m) => m.path).filter((p) => underDir(p, dir) && pathSet.has(p)));
          for (const a of apps) addEntry(a);
          const spring = apps.length > 0 || (parsed.kind === 'build_gradle' && parsed.data.springBoot);
          if (spring) {
            addStack({ kind: 'framework', name: 'Spring Boot', evidence_path: apps[0] ?? path, confidence: 'verified' });
            if (!commands.some((c) => c.command === './gradlew bootRun')) {
              cmd({ phase: 'dev', command: './gradlew bootRun', source_path: path, source_key: null, by_convention: true, hooks: [] });
            }
          }
          if (!commands.some((c) => c.command === './gradlew test')) {
            cmd({ phase: 'test', command: './gradlew test', source_path: path, source_key: null, by_convention: true, hooks: [] });
          }
          break;
        }
        case 'composer': {
          eco('PHP (Composer)');
          addStack({ kind: 'ecosystem', name: 'PHP', evidence_path: path, confidence: 'verified' });
          addStack({ kind: 'package_manager', name: 'Composer', evidence_path: path, confidence: 'verified' });
          cmd({ phase: 'install', command: 'composer install', source_path: path, source_key: null, by_convention: true, hooks: [] });
          for (const name of parsed.data.scripts) {
            const phase = classifyScript(name);
            if (phase === null) continue;
            cmd({
              phase,
              command: `composer run ${name}`,
              source_path: path,
              source_key: `scripts.${name}`,
              by_convention: false,
              hooks: [],
            });
          }
          for (const b of parsed.data.bin) addEntry(joinPath(dir, b));
          const artisan = joinPath(dir, 'artisan');
          if (pathSet.has(artisan)) {
            addStack({ kind: 'framework', name: 'Laravel', evidence_path: artisan, confidence: 'verified' });
            cmd({ phase: 'dev', command: 'php artisan serve', source_path: artisan, source_key: null, by_convention: true, hooks: [] });
            addEntry(joinPath(dir, 'public/index.php'));
            for (const p of paths) {
              if (!underDir(p, dir)) continue;
              const rel = dir === '.' ? p : p.slice(dir.length + 1);
              if ((rel.startsWith('routes/') && rel.endsWith('.php')) || rel.startsWith('app/Http/')) tagged.push({ path: p, tag: 'public_surface' });
              else if (rel.startsWith('app/Policies/')) tagged.push({ path: p, tag: 'security_sensitive' });
              else if (rel.startsWith('config/')) tagged.push({ path: p, tag: 'runtime_config' });
            }
          }
          break;
        }
        case 'csproj': {
          if (!parsed.data.sdk) break;
          eco('.NET');
          addStack({ kind: 'ecosystem', name: '.NET', evidence_path: path, confidence: 'verified' });
          if (parsed.data.executable) {
            const program = joinPath(dir, 'Program.cs');
            addEntry(pathSet.has(program) ? program : path);
            cmd({ phase: 'dev', command: 'dotnet run', source_path: path, source_key: null, by_convention: true, hooks: parsed.data.buildHooks });
          }
          cmd({ phase: 'test', command: 'dotnet test', source_path: path, source_key: null, by_convention: true, hooks: parsed.data.buildHooks });
          break;
        }
        case 'gemfile': {
          eco('Ruby');
          addStack({ kind: 'ecosystem', name: 'Ruby', evidence_path: path, confidence: 'convention' });
          cmd({ phase: 'install', command: 'bundle install', source_path: path, source_key: null, by_convention: true, hooks: [] });
          const rails = parsed.data.gems.includes('rails') || pathSet.has(joinPath(dir, 'bin/rails'));
          if (rails) {
            addStack({ kind: 'framework', name: 'Rails', evidence_path: path, confidence: 'convention' });
            cmd({ phase: 'dev', command: 'bin/rails server', source_path: path, source_key: null, by_convention: true, hooks: [] });
            addEntry(joinPath(dir, 'config.ru'));
            addEntry(joinPath(dir, 'bin/rails'));
            const routes = joinPath(dir, 'config/routes.rb');
            if (pathSet.has(routes)) tagged.push({ path: routes, tag: 'public_surface' });
          }
          break;
        }
        default:
          break;
      }
    }

    // Django: `manage.py` (files verified, command sequence by convention).
    const manage = joinPath(dir, 'manage.py');
    if (pathSet.has(manage)) {
      eco('Python');
      addStack({ kind: 'ecosystem', name: 'Python', evidence_path: here.find((h) => h.parsed.kind === 'pyproject')?.path ?? manage, confidence: 'verified' });
      addStack({ kind: 'framework', name: 'Django', evidence_path: manage, confidence: 'verified' });
      addEntry(manage);
      for (const p of paths) {
        if (!underDir(p, dir)) continue;
        const rel = dir === '.' ? p : p.slice(dir.length + 1);
        if (/^[^/]+\/(wsgi|asgi)\.py$/.test(rel)) addEntry(p);
        if (/^[^/]+\/urls\.py$/.test(rel)) tagged.push({ path: p, tag: 'public_surface' });
      }
      cmd({ phase: 'dev', command: 'python manage.py runserver', source_path: manage, source_key: null, by_convention: true, hooks: [] });
    }

    if (ecosystems.length === 0 && commands.length === 0) continue;
    const fileCount = dir === '.' ? paths.length : paths.filter((p) => underDir(p, dir)).length;
    packages.push({ path: dir, ecosystems, commands, fileCount });
  }

  // JS conventions (U): Yarn/Bun/Nx/Turbo markers add stack evidence only.
  for (const [file, name] of [['nx.json', 'Nx'], ['turbo.json', 'Turborepo']] as const) {
    if (pathSet.has(file)) addStack({ kind: 'framework', name, evidence_path: file, confidence: 'convention' });
  }

  const kindOrder = { ecosystem: 0, package_manager: 1, framework: 2 } as const;
  const stackList = [...stack.values()].sort(
    (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || comparePath(a.name, b.name),
  );

  return {
    stack: stackList,
    packages,
    entryPoints: [...entries].sort(comparePath),
    tagged: tagged.sort((a, b) => comparePath(a.path, b.path) || comparePath(a.tag, b.tag)),
    memberDirs,
    hasWorkspaceMarker: hasMarker,
    skippedParse,
  };
}
