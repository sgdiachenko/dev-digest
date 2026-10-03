import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { BlobTooLargeError, UnsafeGitShowArgsError } from '../src/adapters/git/show-file-at-guard.js';

const run = promisify(execFile);

describe('SimpleGitClient.listTree / readBlob (real git)', () => {
  let root: string;
  let head: string;
  const repo = { owner: 'o', name: 'r' };
  let git: SimpleGitClient;

  const g = (args: string[]) =>
    run('git', args, { cwd: join(root, 'o', 'r') }).then((r) => r.stdout.trim());

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'git-tree-'));
    const dir = join(root, 'o', 'r');
    await mkdir(dir, { recursive: true });
    await g(['init', '-q']);
    await g(['config', 'user.email', 't@t']);
    await g(['config', 'user.name', 't']);
    await g(['config', 'commit.gpgsign', 'false']);
    await writeFile(join(dir, 'a.md'), '# hi\n');
    await writeFile(join(dir, 'bin.md'), Buffer.from([0xff, 0xfe, 0x00, 0x41]));
    await writeFile(join(dir, 'eleven.md'), '12345678901');
    await symlink('a.md', join(dir, 'link.md'));
    await g(['add', '-A']);
    await g([
      'update-index',
      '--add',
      '--cacheinfo',
      '160000,1111111111111111111111111111111111111111,sub',
    ]);
    await g(['commit', '-q', '-m', 'init']);
    head = await g(['rev-parse', 'HEAD']);
    git = new SimpleGitClient(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists symlinks as blob/120000 with target length, gitlinks as commit/null', async () => {
    const tree = await git.listTree(repo, head);
    const byPath = Object.fromEntries(tree.map((e) => [e.path, e]));
    expect(byPath['link.md']).toMatchObject({ mode: '120000', type: 'blob', size: 4 });
    expect(byPath['sub']).toMatchObject({ type: 'commit', size: null });
    expect(byPath['a.md']).toMatchObject({ mode: '100644', type: 'blob', size: 5 });
  });

  it('readBlob returns non-UTF-8 bytes unchanged', async () => {
    const tree = await git.listTree(repo, head);
    const oid = tree.find((e) => e.path === 'bin.md')!.oid;
    const bytes = await git.readBlob(repo, oid);
    expect(Array.from(bytes)).toEqual([0xff, 0xfe, 0x00, 0x41]);
  });

  it('readBlob rejects an over-limit blob before reading it', async () => {
    const tree = await git.listTree(repo, head);
    const oid = tree.find((e) => e.path === 'eleven.md')!.oid;
    await expect(git.readBlob(repo, oid, 10)).rejects.toBeInstanceOf(BlobTooLargeError);
    expect((await git.readBlob(repo, oid, 11)).byteLength).toBe(11);
  });

  it('guards argv: option-like oid and symbolic ref are rejected', async () => {
    await expect(git.readBlob(repo, '--help')).rejects.toBeInstanceOf(UnsafeGitShowArgsError);
    await expect(git.listTree(repo, 'HEAD')).rejects.toBeInstanceOf(UnsafeGitShowArgsError);
  });
});
