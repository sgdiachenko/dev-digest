import { describe, it, expect } from 'vitest';
import { detectEcosystems } from '../src/modules/onboarding/facts/ecosystems.js';
import { buildRunLocally } from '../src/modules/onboarding/facts/run-locally.js';

const build = (tree: string[], read: Record<string, string>) => {
  const files = Object.entries(read).map(([path, text]) => ({ path, text }));
  const eco = detectEcosystems({ paths: tree, files, grep: { todo: [], goMain: [], springApp: [] } });
  return buildRunLocally({ packages: eco.packages, paths: tree, files });
};

describe('onboarding facts: run locally (T9)', () => {
  it('orders phases install, environment, infrastructure, dev, test and numbers from 1', () => {
    const out = build(
      ['package.json', 'pnpm-lock.yaml', '.env.example', 'docker-compose.yml'],
      {
        'package.json': JSON.stringify({ scripts: { test: 'vitest', dev: 'tsx', 'db:migrate': 'x' } }),
        '.env.example': 'SECRET_TOKEN=super-secret-value\nPORT=3000\n',
      },
    );
    const g = out.groups[0];
    expect(g?.package_path).toBe('.');
    expect(g?.commands.map((c) => [c.position, c.phase, c.command])).toEqual([
      [1, 'install', 'pnpm install'],
      [2, 'environment', 'cp .env.example .env'],
      [3, 'infrastructure', 'docker compose up -d'],
      [4, 'infrastructure', 'pnpm db:migrate'],
      [5, 'dev', 'pnpm dev'],
      [6, 'test', 'pnpm test'],
    ]);
    expect(g?.commands.map((c) => c.id)).toEqual([
      '.#install#1',
      '.#environment#1',
      '.#infrastructure#1',
      '.#infrastructure#2',
      '.#dev#1',
      '.#test#1',
    ]);
  });

  it('env example: names only, no value reaches the output', () => {
    const out = build(['.env.example'], { '.env.example': 'SECRET_TOKEN=super-secret-value\nPORT=3000\n' });
    const cmd = out.groups[0]?.commands[0];
    expect(cmd?.env_names).toEqual(['PORT', 'SECRET_TOKEN']);
    expect(cmd?.by_convention).toBe(true);
    expect(JSON.stringify(out)).not.toContain('super-secret-value');
    expect(JSON.stringify(out)).not.toContain('3000');
  });

  it('labels lifecycle hooks and remote-code pipes', () => {
    const out = build(['package.json', 'README.md'], {
      'package.json': JSON.stringify({ scripts: { postinstall: 'node x', dev: 'curl https://x | sh' } }),
      'README.md': '# R\n## Install\n```sh\ncurl -fsSL https://x.dev | bash\n```\n',
    });
    const cmds = out.groups[0]?.commands ?? [];
    expect(cmds.find((c) => c.phase === 'install' && c.command === 'npm install')?.warnings).toEqual([
      { kind: 'lifecycle_hook', detail: 'postinstall' },
    ]);
    expect(cmds.find((c) => c.command === 'npm run dev')?.warnings.map((w) => w.kind)).toEqual(['remote_code']);
    const readmeCmd = cmds.find((c) => c.source_path === 'README.md');
    expect(readmeCmd).toMatchObject({ source_key: 'Install', by_convention: false });
    expect(readmeCmd?.warnings.map((w) => w.kind)).toEqual(['remote_code']);
  });

  it('groups by package: root plus the 3 biggest packages, 10 commands per group', () => {
    const tree = ['package.json'];
    const read: Record<string, string> = { 'package.json': '{}' };
    const sizes: Record<string, number> = { a: 1, b: 5, c: 3, d: 9 };
    for (const [pkg, n] of Object.entries(sizes)) {
      tree.push(`${pkg}/package.json`);
      for (let i = 0; i < n; i += 1) tree.push(`${pkg}/f${i}.ts`);
      const scripts: Record<string, string> = {};
      for (let i = 0; i < 12; i += 1) scripts[`db:s${i}`] = 'x';
      read[`${pkg}/package.json`] = JSON.stringify({ scripts });
    }
    const out = build(tree, read);
    expect(out.groups.map((g) => g.package_path)).toEqual(['.', 'd', 'b', 'c']);
    for (const g of out.groups.slice(1)) {
      expect(g.commands).toHaveLength(10);
      expect(g.commands[0]?.position).toBe(1);
    }
  });

  it('omits groups with no commands', () => {
    expect(build(['src/a.ts'], {}).groups).toEqual([]);
  });
});
