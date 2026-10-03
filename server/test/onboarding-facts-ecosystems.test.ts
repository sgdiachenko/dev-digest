import { describe, it, expect } from 'vitest';
import { detectEcosystems, globMatchesDir } from '../src/modules/onboarding/facts/ecosystems.js';
import {
  parseCargoToml,
  parseCsproj,
  parsePackageJson,
  parsePomXml,
  selectFilesToRead,
} from '../src/modules/onboarding/facts/manifests.js';
import type { TourGrepHits } from '../src/modules/onboarding/facts/types.js';

const noGrep: TourGrepHits = { todo: [], goMain: [], springApp: [] };
const files = (o: Record<string, string>) => Object.entries(o).map(([path, text]) => ({ path, text }));
const det = (tree: string[], read: Record<string, string>, grep: TourGrepHits = noGrep) =>
  detectEcosystems({ paths: tree, files: files(read), grep });

describe('onboarding facts: manifest selection (T7)', () => {
  it('caps manifests at 50 in path order and counts the excess', () => {
    const tree = Array.from({ length: 60 }, (_, i) => ({
      path: `p${String(i).padStart(2, '0')}/package.json`,
      oid: 'a'.repeat(40),
      size: 10,
    }));
    const sel = selectFilesToRead(tree);
    expect(sel.files).toHaveLength(50);
    expect(sel.files[0]?.path).toBe('p00/package.json');
    expect(sel.skipped).toBe(10);
  });

  it('skips and counts files over 512 KiB, ignores vendored dirs', () => {
    const sel = selectFilesToRead([
      { path: 'README.md', oid: 'a', size: 512 * 1024 + 1 },
      { path: 'package.json', oid: 'b', size: 100 },
      { path: 'node_modules/x/package.json', oid: 'c', size: 5 },
      { path: 'src/index.ts', oid: 'd', size: 5 },
    ]);
    expect(sel.files.map((f) => f.path)).toEqual(['package.json']);
    expect(sel.skipped).toBe(1);
  });
});

describe('onboarding facts: ecosystems (T7)', () => {
  it('malformed manifests return null and are counted, never throw', () => {
    expect(parsePackageJson('{not json')).toBeNull();
    expect(parsePackageJson('[]')).toBeNull();
    expect(parsePomXml('garbage')).toBeNull();
    expect(parseCsproj('garbage')).toBeNull();
    const eco = det(['package.json'], { 'package.json': '{oops' });
    expect(eco.skippedParse).toBe(1);
    expect(eco.packages).toEqual([]);
  });

  it('JS: pnpm lockfile is verified, scripts become commands, lifecycle hooks are named', () => {
    const eco = det(['package.json', 'pnpm-lock.yaml', 'src/index.ts'], {
      'package.json': JSON.stringify({
        name: 'x',
        scripts: { dev: 'tsx watch src', test: 'vitest', build: 'tsc', postinstall: 'node setup.js' },
      }),
    });
    expect(eco.stack).toContainEqual({ kind: 'package_manager', name: 'pnpm', evidence_path: 'pnpm-lock.yaml', confidence: 'verified' });
    const cmds = eco.packages[0]?.commands ?? [];
    const install = cmds.find((c) => c.phase === 'install');
    expect(install).toMatchObject({ command: 'pnpm install', by_convention: false, hooks: ['postinstall'] });
    expect(cmds.find((c) => c.phase === 'dev')).toMatchObject({ command: 'pnpm dev', source_key: 'scripts.dev' });
    expect(cmds.some((c) => c.command === 'pnpm build')).toBe(false);
    expect(eco.entryPoints).toContain('src/index.ts');
  });

  it('JS: yarn lockfile is a convention', () => {
    const eco = det(['package.json', 'yarn.lock'], { 'package.json': '{"scripts":{"dev":"x"}}' });
    expect(eco.stack.find((s) => s.name === 'yarn')?.confidence).toBe('convention');
    expect(eco.packages[0]?.commands[0]?.by_convention).toBe(true);
  });

  it('monorepo: a workspace marker restricts packages to its members', () => {
    const eco = det(
      ['package.json', 'pnpm-workspace.yaml', 'apps/web/package.json', 'apps/api/package.json', 'other/package.json'],
      {
        'package.json': '{"name":"root"}',
        'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
        'apps/web/package.json': '{"scripts":{"dev":"x"}}',
        'apps/api/package.json': '{"scripts":{"dev":"y"}}',
        'other/package.json': '{}',
      },
    );
    expect(eco.hasWorkspaceMarker).toBe(true);
    expect(eco.memberDirs).toEqual(['apps/api', 'apps/web']);
    expect(eco.packages.map((p) => p.path)).toEqual(['.', 'apps/api', 'apps/web']);
  });

  it('monorepo without a marker: manifests in the top two levels are packages', () => {
    const eco = det(['server/package.json', 'client/package.json', 'a/b/c/package.json'], {
      'server/package.json': '{}',
      'client/package.json': '{}',
      'a/b/c/package.json': '{}',
    });
    expect(eco.hasWorkspaceMarker).toBe(false);
    expect(eco.packages.map((p) => p.path)).toEqual(['client', 'server']);
  });

  it('Go: package main files become entry points and go run targets (by convention)', () => {
    const eco = det(['go.mod', 'cmd/api/main.go', 'cmd/worker/main.go'], { 'go.mod': 'module x/y\n' }, {
      ...noGrep,
      goMain: [
        { path: 'cmd/worker/main.go', line: 1 },
        { path: 'cmd/api/main.go', line: 1 },
      ],
    });
    expect(eco.entryPoints).toEqual(['cmd/api/main.go', 'cmd/worker/main.go']);
    const cmds = eco.packages[0]?.commands.map((c) => c.command);
    expect(cmds).toEqual(['go run ./cmd/api', 'go run ./cmd/worker', 'go test ./...']);
    expect(eco.packages[0]?.commands.every((c) => c.by_convention)).toBe(true);
  });

  it('Spring: annotated class is the entry point and verifies the framework', () => {
    const eco = det(['pom.xml', 'src/main/java/App.java'], { 'pom.xml': '<project><artifactId>a</artifactId></project>' }, {
      ...noGrep,
      springApp: [{ path: 'src/main/java/App.java', line: 3 }],
    });
    expect(eco.entryPoints).toEqual(['src/main/java/App.java']);
    expect(eco.stack).toContainEqual(expect.objectContaining({ name: 'Spring Boot', confidence: 'verified' }));
  });

  it('.NET: PreBuild Exec hook is carried to the commands', () => {
    const csproj = `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup>
<Target Name="PreBuild" BeforeTargets="PreBuildEvent"><Exec Command="echo hi" /></Target></Project>`;
    const eco = det(['App.csproj', 'Program.cs'], { 'App.csproj': csproj });
    expect(eco.packages[0]?.commands.find((c) => c.command === 'dotnet run')?.hooks).toEqual(['PreBuild']);
    expect(eco.entryPoints).toEqual(['Program.cs']);
  });

  it('Laravel and Django tag route/policy files from conventions', () => {
    const laravel = det(['composer.json', 'artisan', 'routes/web.php', 'app/Policies/P.php', 'public/index.php'], {
      'composer.json': '{"scripts":{"test":"phpunit"}}',
    });
    expect(laravel.tagged).toContainEqual({ path: 'routes/web.php', tag: 'public_surface' });
    expect(laravel.tagged).toContainEqual({ path: 'app/Policies/P.php', tag: 'security_sensitive' });
    expect(laravel.entryPoints).toContain('public/index.php');
    const django = det(['manage.py', 'site/wsgi.py', 'site/urls.py'], {});
    expect(django.entryPoints).toEqual(['manage.py', 'site/wsgi.py']);
    expect(django.packages[0]?.commands[0]).toMatchObject({ command: 'python manage.py runserver', by_convention: true });
  });

  it('Cargo workspace members and glob matching', () => {
    expect(parseCargoToml('[workspace]\nmembers = ["a", "crates/*"]\n')?.members).toEqual(['a', 'crates/*']);
    expect(globMatchesDir('crates/*', 'crates/x')).toBe(true);
    expect(globMatchesDir('crates/*', 'crates/x/y')).toBe(false);
    expect(globMatchesDir('packages/**', 'packages/x/y')).toBe(true);
    expect(globMatchesDir('./apps/web', 'apps/web')).toBe(true);
  });

  it('does not backtrack exponentially on a hostile workspace glob (F1)', () => {
    const dir = 'a/b/c/d/e/f/g/h/i/j/k/l';
    const started = Date.now();
    // 60 nested `**` then a literal that never matches: unmemoised this is ~C(72,12) recursive calls.
    expect(globMatchesDir(`${'**/'.repeat(60)}zzz`, dir)).toBe(false);
    // Non-adjacent `**` cannot be collapsed; memoisation alone has to keep this bounded.
    expect(globMatchesDir(`${'**/a*/'.repeat(25)}zzz`, dir)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(globMatchesDir('**/**/l', dir)).toBe(true);
    expect(globMatchesDir('a/**/l', dir)).toBe(true);
  });
});
