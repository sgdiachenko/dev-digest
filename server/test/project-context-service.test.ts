import { describe, it, expect, vi } from 'vitest';
import type { GitTreeEntry, Tokenizer } from '@devdigest/shared';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type {
  CatalogDoc,
  CatalogState,
  ContextRepo,
  DocUsage,
  ProjectContextStore,
  ReplaceCatalogInput,
} from '../src/modules/project-context/types.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { ContextUnavailableError } from '../src/modules/project-context/types.js';
import { NotFoundError, ConflictError } from '../src/platform/errors.js';
import { REFRESH_JOB_KIND } from '../src/modules/repo-intel/constants.js';
import { CONTEXT_SCAN_JOB_KIND, STALE_SCAN_MS } from '../src/modules/project-context/constants.js';

const oid = (c: string) => c.repeat(40);
const entry = (path: string, o: string, size: number): GitTreeEntry => ({
  path,
  mode: '100644',
  type: 'blob',
  oid: o,
  size,
});

const REPO: ContextRepo = {
  id: 'r1',
  workspaceId: 'w1',
  owner: 'acme',
  name: 'app',
  defaultBranch: 'develop',
  clonePath: '/clone',
};

class FakeStore implements ProjectContextStore {
  state: CatalogState | null = null;
  docs: CatalogDoc[] = [];
  errors: string[] = [];
  replaced = 0;
  constructor(public repo: ContextRepo | null = REPO) {}
  async getRepo(ws: string, id: string) {
    return this.repo && this.repo.workspaceId === ws && this.repo.id === id ? this.repo : null;
  }
  async getRepoById(id: string) {
    return this.repo && this.repo.id === id ? this.repo : null;
  }
  async getCatalogState() {
    return this.state;
  }
  async listDocs() {
    return [...this.docs].sort((a, b) => (a.path < b.path ? -1 : 1));
  }
  async getDoc(_r: string, path: string) {
    return this.docs.find((d) => d.path === path) ?? null;
  }
  usage = new Map<string, DocUsage>();
  async getDocs(_r: string, paths: string[]) {
    return this.docs.filter((d) => paths.includes(d.path));
  }
  async listUsage() {
    return this.usage;
  }
  async markScanning(repoId: string, _ws: string, startedAt: Date) {
    this.state = { ...(this.state ?? blankState(repoId)), status: 'scanning', scanStartedAt: startedAt };
  }
  async replaceCatalog(i: ReplaceCatalogInput) {
    this.replaced += 1;
    this.docs = i.docs;
    this.state = {
      repoId: i.repoId,
      status: 'ready',
      branch: i.branch,
      scannedSha: i.scannedSha,
      scannedAt: i.scannedAt,
      scanStartedAt: null,
      totalFiles: i.totalFiles,
      truncated: i.truncated,
      error: null,
    };
  }
  async markError(repoId: string, _ws: string, reason: string) {
    this.errors.push(reason);
    this.state = { ...(this.state ?? blankState(repoId)), status: 'error', error: reason, scanStartedAt: null };
  }
}

function blankState(repoId: string): CatalogState {
  return {
    repoId,
    status: 'ready',
    branch: null,
    scannedSha: null,
    scannedAt: null,
    scanStartedAt: null,
    totalFiles: 0,
    truncated: false,
    error: null,
  };
}

function setup(opts: { git?: ConstructorParameters<typeof MockGitClient>[0]; store?: FakeStore } = {}) {
  const store = opts.store ?? new FakeStore();
  const git = new MockGitClient({
    head: 'aaaaaaa1',
    syncedHead: 'bbbbbbb2',
    tree: [entry('README.md', oid('1'), 5), entry('docs/a.md', oid('2'), 3)],
    blobs: { [oid('1')]: 'hello', [oid('2')]: 'abc' },
    ...opts.git,
  });
  const counter = { calls: 0 };
  const tokenizer: Tokenizer = {
    count: (s) => {
      counter.calls += 1;
      return s.length * 10;
    },
  };
  const enqueued: { kind: string; payload: unknown }[] = [];
  const handlers = new Map<string, (p: unknown) => Promise<void>>();
  const jobs = {
    register: (k: string, h: (p: unknown) => Promise<void>) => void handlers.set(k, h),
    enqueue: async (_ws: string, kind: string, payload: unknown) => {
      enqueued.push({ kind, payload });
      return { id: 'j1' };
    },
  };
  const service = new ProjectContextService(store, git, tokenizer, jobs);
  return { service, store, git, counter, enqueued, handlers };
}

const logger = () => ({ info: vi.fn(), warn: vi.fn() });
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('ProjectContextService', () => {
  it('first GET starts a scan from currentHead (no sync) and returns scanning; then ready', async () => {
    const { service, git, counter } = setup();
    const first = await service.getCatalog('w1', 'r1');
    expect(first.status).toBe('scanning');
    expect(first.files).toEqual([]);
    await settle();
    expect(git.syncs).toHaveLength(0);
    const second = await service.getCatalog('w1', 'r1');
    expect(second.status).toBe('ready');
    expect(second.scanned_sha).toBe('aaaaaaa1');
    expect(second.branch).toBe('develop');
    expect(second.files.map((f) => f.path)).toEqual(['README.md', 'docs/a.md']);
    expect(second.files[0]).toMatchObject({ est_tokens: 50, used_by: { agents: [], skills: [] }, status: 'ok' });
    expect(counter.calls).toBe(2);
  });

  it('reports not_cloned without scanning', async () => {
    const store = new FakeStore({ ...REPO, clonePath: null });
    const { service } = setup({ store });
    const c = await service.getCatalog('w1', 'r1');
    expect(c.status).toBe('not_cloned');
    expect(c.files).toEqual([]);
    expect(store.state).toBeNull();
  });

  it('404s for a repo outside the workspace', async () => {
    const { service } = setup();
    await expect(service.getCatalog('other', 'r1')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.readDoc('other', 'r1', 'README.md')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.rescan('other', 'r1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rescan conflicts when the repo is not cloned', async () => {
    const { service } = setup({ store: new FakeStore({ ...REPO, clonePath: null }) });
    await expect(service.rescan('w1', 'r1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('rescan syncs the default branch and enqueues a repo-intel refresh', async () => {
    const { service, git, store, enqueued } = setup();
    const res = await service.rescan('w1', 'r1');
    expect(res).toEqual({ status: 'accepted', catalog_status: 'scanning' });
    await settle();
    expect(git.syncs).toEqual([{ repo: { owner: 'acme', name: 'app' }, branch: 'develop' }]);
    expect(store.state?.scannedSha).toBe('bbbbbbb2');
    expect(enqueued).toEqual([
      { kind: REFRESH_JOB_KIND, payload: { repoId: 'r1', owner: 'acme', name: 'app' } },
    ]);
  });

  it('does not turn a just-finished scan into scan_interrupted when a poll read a stale scanning row (F1)', async () => {
    const store = new FakeStore();
    await setup({ store }).service.getCatalog('w1', 'r1');
    await settle();
    const ready = store.state!;
    // the poll's read was answered late: it still saw "scanning", though the scan has committed
    const scanning: CatalogState = { ...ready, status: 'scanning', scanStartedAt: new Date() };
    let reads = 0;
    store.getCatalogState = async () => (reads++ === 0 ? scanning : ready);
    const { service } = setup({ store });
    const c = await service.getCatalog('w1', 'r1');
    expect(store.errors).toEqual([]);
    expect(c.status).toBe('ready');
  });

  it('a rescan that arrives during a running no-sync scan still syncs afterwards (AC-16)', async () => {
    const { service, git, store } = setup();
    await service.getCatalog('w1', 'r1'); // lazy first scan, no sync, still running
    await service.rescan('w1', 'r1');
    await settle();
    expect(git.syncs).toHaveLength(1);
    expect(store.state?.scannedSha).toBe('bbbbbbb2');
  });

  it('rescans queued behind one no-sync scan run a single sync (AC-16, EC-10)', async () => {
    const { service, git } = setup();
    await service.getCatalog('w1', 'r1');
    await Promise.all([service.rescan('w1', 'r1'), service.rescan('w1', 'r1')]);
    await settle();
    expect(git.syncs).toHaveLength(1);
  });

  it('lists files in code-unit path order whatever order the store returns (AC-4, C24)', async () => {
    const store = new FakeStore();
    await setup({ store }).service.getCatalog('w1', 'r1');
    await settle();
    const doc = (path: string): CatalogDoc => ({ ...store.docs[0]!, path });
    // a database collation would put "a.md" before "B.md"; code-unit order is "B.md" first.
    store.listDocs = async () => [doc('a.md'), doc('B.md'), doc('_x.md')];
    const { service } = setup({ store });
    const c = await service.getCatalog('w1', 'r1');
    expect(c.files.map((f) => f.path)).toEqual(['B.md', '_x.md', 'a.md']);
  });

  it('two concurrent rescans run one sync', async () => {
    const { service, git } = setup();
    await Promise.all([service.rescan('w1', 'r1'), service.rescan('w1', 'r1')]);
    await settle();
    expect(git.syncs).toHaveLength(1);
  });

  it('a failed sync becomes error with a reason and leaves earlier docs untouched', async () => {
    const { service, store } = setup();
    await service.rescan('w1', 'r1');
    await settle();
    const before = [...store.docs];
    const failing = setup({ store, git: { syncError: new Error('network down') } });
    await failing.service.rescan('w1', 'r1');
    await settle();
    expect(store.state?.status).toBe('error');
    expect(store.errors[0]).toMatch(/^sync_failed:network down/);
    expect(store.docs).toEqual(before);
    const c = await failing.service.getCatalog('w1', 'r1');
    expect(c.status).toBe('error');
    expect(c.error).toMatch(/network down/);
    expect(c.files).toHaveLength(before.length);
  });

  it('reuses unchanged blobs without reading them (by blob oid)', async () => {
    const { service, git, counter } = setup();
    await service.rescan('w1', 'r1');
    await settle();
    const reads = git.readBlobCalls.length;
    const tokens = counter.calls;
    await service.rescan('w1', 'r1');
    await settle();
    expect(git.readBlobCalls.length).toBe(reads);
    expect(counter.calls).toBe(tokens);
  });

  it('marks a stuck scanning row as scan_interrupted', async () => {
    const store = new FakeStore();
    store.state = { ...blankState('r1'), status: 'scanning', scanStartedAt: new Date() };
    const { service } = setup({ store });
    const c = await service.getCatalog('w1', 'r1');
    expect(c.status).toBe('error');
    expect(c.error).toBe('scan_interrupted');
    expect(store.errors).toEqual(['scan_interrupted']);
  });

  it('treats a live scan older than STALE_SCAN_MS as interrupted', async () => {
    const store = new FakeStore();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { service, git } = setup({ store });
    git.currentHead = async () => {
      await gate;
      return 'aaaaaaa1';
    };
    await service.getCatalog('w1', 'r1'); // starts scan, parks on gate
    await settle();
    store.state = { ...store.state!, scanStartedAt: new Date(Date.now() - STALE_SCAN_MS - 1000) };
    const c = await service.getCatalog('w1', 'r1');
    expect(c.error).toBe('scan_interrupted');
    release();
    await settle();
  });

  it('readDoc: unknown path -> 404 not_in_catalog with no git call', async () => {
    const { service, git } = setup();
    await service.rescan('w1', 'r1');
    await settle();
    git.readBlobCalls.length = 0;
    for (const p of ['../x', '/etc/passwd', 'nope.md']) {
      const err = await service.readDoc('w1', 'r1', p).catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundError);
      expect(err.details).toMatchObject({ reason: 'not_in_catalog' });
    }
    expect(git.readBlobCalls).toEqual([]);
  });

  it('readDoc: returns content for ok, null for too_large, and 404 commit_unavailable on git failure', async () => {
    const big = entry('big.md', oid('3'), 70_000);
    const { service, git } = setup({
      git: { tree: [entry('README.md', oid('1'), 5), big] },
    });
    await service.rescan('w1', 'r1');
    await settle();
    const ok = await service.readDoc('w1', 'r1', 'README.md');
    expect(ok).toMatchObject({ status: 'ok', content: 'hello', sha: 'bbbbbbb2', est_tokens: 50 });
    const tooLarge = await service.readDoc('w1', 'r1', 'big.md');
    expect(tooLarge).toMatchObject({ status: 'too_large', content: null, est_tokens: null });
    expect(git.readBlobCalls).not.toContain(oid('3'));

    const failing = new MockGitClient({ readBlobError: new Error('bad object') });
    (service as unknown as { git: MockGitClient }).git = failing;
    const err = await service.readDoc('w1', 'r1', 'README.md').catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.details).toMatchObject({ reason: 'commit_unavailable', branch: 'develop', sha: 'bbbbbbb2' });
  });

  it('logs exactly one info with aggregates and never document content', async () => {
    const log = logger();
    const { service } = setup({ git: { blobs: { [oid('1')]: 'TOP-SECRET-BODY', [oid('2')]: 'x' } } });
    await service.rescan('w1', 'r1', log);
    await settle();
    expect(log.info).toHaveBeenCalledTimes(1);
    const [obj] = log.info.mock.calls[0]!;
    expect(obj).toMatchObject({ repoId: 'r1', sha: 'bbbbbbb2', entries: 2 });
    expect(obj.skipped).toBeDefined();
    expect(typeof obj.durationMs).toBe('number');
    expect(JSON.stringify(log.info.mock.calls)).not.toContain('TOP-SECRET-BODY');
  });

  it('counts blob read failures separately from unreadable documents in the scan log, without their text', async () => {
    const log = logger();
    const { service } = setup({ git: { readBlobError: new Error('io failure /secret/clone/path') } });
    await service.rescan('w1', 'r1', log);
    await settle();
    const [obj] = log.info.mock.calls[0]!;
    expect(obj.skipped).toMatchObject({ unreadable: 2, read_failed: 2 });
    expect(JSON.stringify(log.info.mock.calls)).not.toContain('/secret/clone/path');
  });

  it('readDoc: sha and branch come from the same scan as the document row (catalog swapped mid-read)', async () => {
    const store = new FakeStore();
    const { service } = setup({ store });
    await service.rescan('w1', 'r1');
    await settle();
    const swapped: CatalogState = { ...store.state!, scannedSha: 'newsha99' };
    const original = store.state!;
    let reads = 0;
    // the first read (before the doc) sees the old scan, every later read sees the new one
    store.getCatalogState = async () => (reads++ === 0 ? original : swapped);
    const doc = await service.readDoc('w1', 'r1', 'README.md');
    expect(doc.sha).toBe('newsha99');
    expect(reads).toBeGreaterThan(2); // it noticed the swap and read again
  });

  it('scan job handler never throws and builds the catalog', async () => {
    const { service, handlers, store } = setup();
    const log = logger();
    service.registerScanJobHandler(log);
    const handler = handlers.get(CONTEXT_SCAN_JOB_KIND)!;
    await expect(handler({ repoId: 'r1' })).resolves.toBeUndefined();
    expect(store.state?.status).toBe('ready');
    await expect(handler({ repoId: 'missing' })).resolves.toBeUndefined();
    const broken = setup({ git: { listTreeError: new Error('boom') } });
    broken.service.registerScanJobHandler(log);
    await expect(broken.handlers.get(CONTEXT_SCAN_JOB_KIND)!({ repoId: 'r1' })).resolves.toBeUndefined();
    expect(broken.store.state?.status).toBe('error');
  });

  it('has no LLM dependency: the constructor takes exactly store, git, tokenizer, jobs', () => {
    expect(ProjectContextService.length).toBe(4);
  });

  it('getCatalog fills used_by from direct attachments; unused documents get empty arrays (AC-38, EC-15)', async () => {
    const store = new FakeStore();
    await setup({ store }).service.getCatalog('w1', 'r1');
    await settle();
    store.usage.set('README.md', {
      agents: [{ id: 'a1', name: 'Agent' }],
      skills: [{ id: 's1', name: 'Skill' }],
    });
    const { service } = setup({ store });
    const c = await service.getCatalog('w1', 'r1');
    expect(c.files.find((f) => f.path === 'README.md')!.used_by).toEqual({
      agents: [{ id: 'a1', name: 'Agent' }],
      skills: [{ id: 's1', name: 'Skill' }],
    });
    expect(c.files.find((f) => f.path === 'docs/a.md')!.used_by).toEqual({ agents: [], skills: [] });
  });

  describe('resolveDocs', () => {
    async function scanned(gitOpts: Parameters<typeof setup>[0] = {}) {
      const ctx = setup(gitOpts);
      await ctx.service.rescan('w1', 'r1');
      await settle();
      ctx.git.readBlobCalls.length = 0;
      return ctx;
    }

    it('reads text by blob oid at the scanned sha, in the order of paths, never from the working tree (AC-18, EC-20)', async () => {
      const { service, git } = await scanned();
      const readFile = vi.spyOn(git, 'readFile');
      const showFileAt = vi.spyOn(git, 'showFileAt');
      const res = await service.resolveDocs('w1', 'r1', ['docs/a.md', 'README.md']);
      expect(res).toMatchObject({ sha: 'bbbbbbb2', branch: 'develop' });
      expect(res.docs.map((d) => [d.path, d.status, d.text])).toEqual([
        ['docs/a.md', 'ok', 'abc'],
        ['README.md', 'ok', 'hello'],
      ]);
      expect(res.docs[1]).toMatchObject({ estTokens: 50, secretWarning: false });
      expect(git.readBlobCalls).toEqual([oid('2'), oid('1')]);
      expect(readFile).not.toHaveBeenCalled();
      expect(showFileAt).not.toHaveBeenCalled();
    });

    it('a path outside the catalog is missing and never reaches git (AC-23)', async () => {
      const { service, git } = await scanned();
      const res = await service.resolveDocs('w1', 'r1', ['../etc/passwd', 'gone.md']);
      expect(res.docs.map((d) => [d.path, d.status, d.text, d.category])).toEqual([
        ['../etc/passwd', 'missing', null, null],
        ['gone.md', 'missing', null, null],
      ]);
      expect(git.readBlobCalls).toEqual([]);
    });

    it('too_large and unreadable come from the catalog without a read; empty has empty text (AC-23, EC-8)', async () => {
      const { service, git } = await scanned({
        git: {
          tree: [entry('big.md', oid('3'), 70_000), entry('empty.md', oid('4'), 0), entry('bin.md', oid('5'), 2)],
          blobs: { [oid('5')]: new Uint8Array([0xff, 0xfe]) },
        },
      });
      git.readBlobCalls.length = 0;
      const res = await service.resolveDocs('w1', 'r1', ['big.md', 'empty.md', 'bin.md']);
      expect(res.docs.map((d) => [d.status, d.text])).toEqual([
        ['too_large', null],
        ['empty', ''],
        ['unreadable', null],
      ]);
      expect(git.readBlobCalls).toEqual([]);
    });

    it('a blob that fails to read is missing; one that exceeds the limit at read time is too_large', async () => {
      const { service, git } = await scanned();
      git.readBlob = async () => {
        throw new Error('bad object');
      };
      expect((await service.resolveDocs('w1', 'r1', ['README.md'])).docs[0]).toMatchObject({
        status: 'missing',
        text: null,
      });
      const { BlobTooLargeError } = await import('../src/adapters/git/show-file-at-guard.js');
      git.readBlob = async () => {
        throw new BlobTooLargeError(oid('1'), '(blob)', 99, 10);
      };
      expect((await service.resolveDocs('w1', 'r1', ['README.md'])).docs[0]).toMatchObject({
        status: 'too_large',
        text: null,
      });
    });

    it('a non-UTF-8 blob is unreadable', async () => {
      const { service, git } = await scanned();
      git.readBlob = async () => new Uint8Array([0xc3, 0x28]);
      expect((await service.resolveDocs('w1', 'r1', ['README.md'])).docs[0]).toMatchObject({
        status: 'unreadable',
        text: null,
      });
    });

    it('re-reads once when the scan moved between the state and the rows (C19)', async () => {
      const { service, store } = await scanned();
      const original = store.state!;
      const moved: CatalogState = { ...original, scannedSha: 'newsha99' };
      let reads = 0;
      store.getCatalogState = async () => (reads++ === 0 ? original : moved);
      const res = await service.resolveDocs('w1', 'r1', ['README.md']);
      expect(res.sha).toBe('newsha99');
      expect(reads).toBeGreaterThan(2);
    });

    it('throws no_clone for an uncloned repo and no_catalog before the first scan', async () => {
      const uncloned = setup({ store: new FakeStore({ ...REPO, clonePath: null }) });
      await expect(uncloned.service.resolveDocs('w1', 'r1', ['README.md'])).rejects.toMatchObject({
        name: 'ContextUnavailableError',
        reason: 'no_clone',
      });
      const fresh = setup();
      const err = await fresh.service.resolveDocs('w1', 'r1', ['README.md']).catch((e) => e);
      expect(err).toBeInstanceOf(ContextUnavailableError);
      expect(err.reason).toBe('no_catalog');
      expect(fresh.git.readBlobCalls).toEqual([]);
    });

    it('404s for a repo outside the workspace', async () => {
      const { service } = setup();
      await expect(service.resolveDocs('other', 'r1', [])).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
