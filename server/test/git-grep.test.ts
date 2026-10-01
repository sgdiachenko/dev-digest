import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import {
  assertSafeGrepArgs,
  parseGrepNull,
  UnsafeGitShowArgsError,
} from '../src/adapters/git/show-file-at-guard.js';
import { MockGitClient } from '../src/adapters/mocks.js';

const run = promisify(execFile);
const SHA = 'a'.repeat(40);

describe('parseGrepNull', () => {
  it('strips the <sha>: prefix and parses path + line', () => {
    const raw = `${SHA}:src/a.ts\x001\x00foo\n${SHA}:d/b c.ts\x0012\x00foo bar\n`;
    expect(parseGrepNull(raw, SHA)).toEqual([
      { path: 'src/a.ts', line: 1 },
      { path: 'd/b c.ts', line: 12 },
    ]);
  });

  it('skips records that are not grep hits and handles empty output', () => {
    expect(parseGrepNull('', SHA)).toEqual([]);
    expect(parseGrepNull(`garbage\n${SHA}:x\x00notanumber\x00y\n`, SHA)).toEqual([]);
  });
});

describe('assertSafeGrepArgs', () => {
  it('rejects option-like or symbolic sha, empty/NUL patterns, unsafe pathspecs', () => {
    expect(() => assertSafeGrepArgs('HEAD', ['x'])).toThrow(UnsafeGitShowArgsError);
    expect(() => assertSafeGrepArgs('--help', ['x'])).toThrow(UnsafeGitShowArgsError);
    expect(() => assertSafeGrepArgs(SHA, [])).toThrow(UnsafeGitShowArgsError);
    expect(() => assertSafeGrepArgs(SHA, [''])).toThrow(UnsafeGitShowArgsError);
    expect(() => assertSafeGrepArgs(SHA, ['a\0b'])).toThrow(UnsafeGitShowArgsError);
    expect(() => assertSafeGrepArgs(SHA, ['x'], ['../etc'])).toThrow(UnsafeGitShowArgsError);
    expect(() => assertSafeGrepArgs(SHA, ['x'], ['/abs'])).toThrow(UnsafeGitShowArgsError);
    expect(() => assertSafeGrepArgs(SHA, ['x'], ['-o'])).toThrow(UnsafeGitShowArgsError);
    expect(() => assertSafeGrepArgs(SHA, ['x'], [':(top)x'])).toThrow(UnsafeGitShowArgsError);
  });

  it('accepts a dash-leading pattern (travels after -e) and glob pathspecs', () => {
    expect(() => assertSafeGrepArgs(SHA, ['-rf'], ['src', '*.ts'])).not.toThrow();
  });
});

describe('SimpleGitClient.grepAt (real git)', () => {
  let root: string;
  let head: string;
  const repo = { owner: 'o', name: 'r' };
  let git: SimpleGitClient;

  const g = (args: string[]) =>
    run('git', args, { cwd: join(root, 'o', 'r') }).then((r) => r.stdout.trim());

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'git-grep-'));
    const dir = join(root, 'o', 'r');
    await mkdir(join(dir, 'src'), { recursive: true });
    await g(['init', '-q']);
    await g(['config', 'user.email', 't@t']);
    await g(['config', 'user.name', 't']);
    await g(['config', 'commit.gpgsign', 'false']);
    await writeFile(join(dir, 'a.ts'), 'x\nroute()\nROUTE()\nroute()\n');
    await writeFile(join(dir, 'src', 'b.ts'), 'route()\n');
    await writeFile(join(dir, 'bin.dat'), Buffer.from('route\0'));
    await g(['add', '-A']);
    await g(['commit', '-q', '-m', 'one']);
    const first = await g(['rev-parse', 'HEAD']);
    // Worktree change after the commit must never be visible to grepAt.
    await writeFile(join(dir, 'a.ts'), 'route()\nroute()\nroute()\nroute()\n');
    await writeFile(join(dir, 'untracked.ts'), 'route()\n');
    head = first;
    git = new SimpleGitClient(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns path/line from the committed tree, skipping binaries and the worktree', async () => {
    const hits = await git.grepAt(repo, head, ['route']);
    expect(hits).toEqual([
      { path: 'a.ts', line: 2 },
      { path: 'a.ts', line: 4 },
      { path: 'src/b.ts', line: 1 },
    ]);
  });

  it('honours ignoreCase, maxPerFile, maxResults and pathspecs', async () => {
    expect((await git.grepAt(repo, head, ['route'], { ignoreCase: true })).length).toBe(4);
    expect(await git.grepAt(repo, head, ['route'], { maxPerFile: 1 })).toEqual([
      { path: 'a.ts', line: 2 },
      { path: 'src/b.ts', line: 1 },
    ]);
    expect(await git.grepAt(repo, head, ['route'], { maxResults: 1 })).toEqual([
      { path: 'a.ts', line: 2 },
    ]);
    expect(await git.grepAt(repo, head, ['route'], { pathspecs: ['src'] })).toEqual([
      { path: 'src/b.ts', line: 1 },
    ]);
  });

  it('returns [] when nothing matches', async () => {
    expect(await git.grepAt(repo, head, ['zzz-no-such-token'])).toEqual([]);
  });

  it('guards argv before shelling out', async () => {
    await expect(git.grepAt(repo, 'HEAD', ['x'])).rejects.toBeInstanceOf(UnsafeGitShowArgsError);
    await expect(git.grepAt(repo, head, ['x'], { pathspecs: ['../x'] })).rejects.toBeInstanceOf(
      UnsafeGitShowArgsError,
    );
  });
});

describe('MockGitClient.grepAt', () => {
  it('records calls, applies the same guard, honours maxResults and grepError', async () => {
    const repo = { owner: 'o', name: 'r' };
    const mock = new MockGitClient({
      grep: [
        { path: 'a', line: 1 },
        { path: 'b', line: 2 },
      ],
    });
    expect(await mock.grepAt(repo, SHA, ['x'], { maxResults: 1 })).toEqual([{ path: 'a', line: 1 }]);
    expect(mock.grepCalls).toHaveLength(1);
    await expect(mock.grepAt(repo, 'HEAD', ['x'])).rejects.toBeInstanceOf(UnsafeGitShowArgsError);
    const failing = new MockGitClient({ grepError: new Error('boom') });
    await expect(failing.grepAt(repo, SHA, ['x'])).rejects.toThrow('boom');
  });
});
