/**
 * Pure argument guard for `GitClient.showFileAt` (`git show <ref>:<path>`).
 *
 * Split out from `simple-git.ts` so it is unit-testable without a real git
 * repo — the guard is what actually stands between an attacker-controlled
 * ref/path (Intent Layer spec-doc reading) and a `git show` argv, so it needs
 * direct coverage, not just an integration test.
 *
 * Defense in depth, independent of any caller-side allow-list (e.g. the intent
 * module's doc-extension check):
 *  - `ref` must look like a real (possibly abbreviated) git SHA — never an
 *    option flag, a symbolic ref, or an attacker-supplied string forwarded
 *    straight into `git show`.
 *  - `path` must be a relative, plain path: no leading `/` (absolute), no `..`
 *    segment (traversal), no leading `-` (argument-injection — a path that
 *    looks like `-o x` would otherwise be read as a git option), and no NUL
 *    byte (path truncation attacks in some C git builds).
 */

const SHA_RE = /^[0-9a-f]{7,40}$/;

export class UnsafeGitShowArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeGitShowArgsError';
  }
}

/** Thrown by `showFileAt` when `maxBytes` is given and the blob's real size
 *  (from `git cat-file -s`, checked BEFORE reading it) exceeds it — the read
 *  never happens, unlike a client-side cap applied after `git show` already
 *  returned the whole file. */
export class BlobTooLargeError extends Error {
  constructor(
    ref: string,
    path: string,
    public readonly sizeBytes: number,
    public readonly maxBytes: number,
  ) {
    super(`${ref}:${path} is ${sizeBytes} bytes (max ${maxBytes})`);
    this.name = 'BlobTooLargeError';
  }
}

/** Parse `git cat-file -s`'s stdout (a bare integer, possibly with trailing
 *  whitespace/newline) into a byte count. Throws if it isn't one. */
export function parseBlobSize(raw: string): number {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new UnsafeGitShowArgsError(`Unexpected "git cat-file -s" output: ${JSON.stringify(raw)}`);
  }
  return n;
}

export function assertSafeRef(ref: string): void {
  if (!SHA_RE.test(ref)) {
    throw new UnsafeGitShowArgsError(`Unsafe git ref (expected a 7-40 char hex sha): ${ref}`);
  }
}

export function assertSafePath(path: string): void {
  if (path.length === 0) throw new UnsafeGitShowArgsError('Empty path');
  if (path.includes('\0')) throw new UnsafeGitShowArgsError(`Unsafe path (NUL byte): ${path}`);
  if (path.startsWith('/')) throw new UnsafeGitShowArgsError(`Unsafe path (absolute): ${path}`);
  if (path.startsWith('-')) {
    throw new UnsafeGitShowArgsError(`Unsafe path (looks like an option): ${path}`);
  }
  const segments = path.split('/');
  if (segments.some((s) => s === '..')) {
    throw new UnsafeGitShowArgsError(`Unsafe path (traversal): ${path}`);
  }
}

/** Validate both `ref` and `path` before they reach `git show <ref>:<path>`. */
export function assertSafeShowFileAtArgs(ref: string, path: string): void {
  assertSafeRef(ref);
  assertSafePath(path);
}
