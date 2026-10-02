import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ContextCatalog, ContextDoc } from '@devdigest/shared';
import { ContextAttachmentsService } from '../src/modules/context-attachments/service.js';
import type {
  AgentContextStore,
  DocRef,
  LinkedSkill,
  OrderedDocRef,
  SkillContextStore,
  SkillOrderedDocRef,
} from '../src/modules/context-attachments/types.js';
import { ContextUnavailableError } from '../src/modules/project-context/types.js';
import type {
  ProjectContextCatalog,
  ResolvedDoc,
  ResolvedDocs,
} from '../src/modules/project-context/types.js';
import { NotFoundError, ValidationError } from '../src/platform/errors.js';

const WS = 'ws-1';
const REPO = '11111111-1111-4111-8111-111111111111';
const OTHER_REPO = '22222222-2222-4222-8222-222222222222';
const FOREIGN_REPO = '33333333-3333-4333-8333-333333333333';

const cdoc = (path: string, est: number | null, status: ContextDoc['status'] = 'ok'): ContextDoc => ({
  path,
  category: 'docs',
  size: 10,
  est_tokens: est,
  status,
  secret_warning: false,
  used_by: null,
});

class FakeCatalog implements ProjectContextCatalog {
  files = new Map<string, ContextDoc[]>();
  resolved: Record<string, Partial<ResolvedDoc>> = {};
  resolveError: unknown = null;
  resolveHangs = false;
  resolveCalls: string[][] = [];
  getCatalogCalls: string[] = [];

  async getCatalog(_ws: string, repoId: string): Promise<ContextCatalog> {
    this.getCatalogCalls.push(repoId);
    const files = this.files.get(repoId);
    if (!files) throw new NotFoundError('Repo not found');
    return {
      repo_id: repoId,
      status: 'ready',
      branch: 'main',
      scanned_sha: 'a'.repeat(40),
      scanned_at: null,
      total_files: files.length,
      truncated: false,
      error: null,
      files,
    };
  }
  async readDoc(): Promise<never> {
    throw new Error('not used');
  }
  async resolveDocs(_ws: string, _repo: string, paths: string[]): Promise<ResolvedDocs> {
    this.resolveCalls.push(paths);
    if (this.resolveHangs) return new Promise(() => {});
    if (this.resolveError) throw this.resolveError;
    return {
      sha: 'a'.repeat(40),
      branch: 'main',
      docs: paths.map((path) => ({
        path,
        category: 'docs',
        status: 'ok',
        text: `text of ${path}`,
        estTokens: 100,
        secretWarning: false,
        ...this.resolved[path],
      })),
    };
  }
}

class FakeAgents implements AgentContextStore {
  known = new Set(['agent-1']);
  docs: OrderedDocRef[] = [];
  enabled: { id: string }[] = [];
  byAgent: Record<string, OrderedDocRef[]> = {};
  replaced: DocRef[][] = [];
  async getById(_ws: string, id: string) {
    return this.known.has(id) ? { id } : undefined;
  }
  async listEnabledIdsOrdered() {
    return this.enabled;
  }
  async listContextDocs(agentId: string) {
    return this.byAgent[agentId] ?? this.docs;
  }
  async replaceContextDocs(_ws: string, _id: string, docs: DocRef[]) {
    this.replaced.push(docs);
    this.docs = docs.map((d, position) => ({ ...d, position }));
    return { changed: true, version: 2 };
  }
}

class FakeSkills implements SkillContextStore {
  known = new Set(['skill-1']);
  linked: LinkedSkill[] = [];
  docs: SkillOrderedDocRef[] = [];
  listForSkillsCalls: string[][] = [];
  async getById(_ws: string, id: string) {
    return this.known.has(id) ? { id } : undefined;
  }
  async listContextDocs(skillId: string) {
    return this.docs.filter((d) => d.skillId === skillId);
  }
  async listContextDocsForSkills(skillIds: string[], repoId?: string) {
    this.listForSkillsCalls.push(skillIds);
    return this.docs.filter((d) => skillIds.includes(d.skillId) && (!repoId || d.repoId === repoId));
  }
  async replaceContextDocs(_ws: string, skillId: string, docs: DocRef[]) {
    this.docs = docs.map((d, position) => ({ ...d, skillId, position }));
  }
  linkedByAgent: Record<string, LinkedSkill[]> = {};
  async linkedForAgentWithState(agentId?: string) {
    return (agentId && this.linkedByAgent[agentId]) || this.linked;
  }
}

function setup() {
  const agents = new FakeAgents();
  const skills = new FakeSkills();
  const catalog = new FakeCatalog();
  catalog.files.set(REPO, [cdoc('a.md', 100), cdoc('b.md', 200), cdoc('c.md', 300), cdoc('empty.md', 0, 'empty')]);
  catalog.files.set(OTHER_REPO, [cdoc('x.md', 50)]);
  const service = new ContextAttachmentsService(agents, skills, catalog);
  return { agents, skills, catalog, service };
}

const ref = (path: string, repoId = REPO, position = 0): OrderedDocRef => ({ repoId, path, position });
const sref = (skillId: string, path: string, position: number, repoId = REPO): SkillOrderedDocRef => ({
  skillId,
  repoId,
  path,
  position,
});
const body = (...docs: [string, string][]) => ({ docs: docs.map(([repo_id, path]) => ({ repo_id, path })) });

afterEach(() => vi.useRealTimers());

describe('putAgent validation (AC-8, D1)', () => {
  it('rejects a duplicate pair with 422 before any write', async () => {
    const { service, agents } = setup();
    const err = await service.putAgent(WS, 'agent-1', REPO, body([REPO, 'a.md'], [REPO, 'a.md'])).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(agents.replaced).toEqual([]);
  });

  it('rejects a repo outside the workspace with 422 (not 404) and writes nothing', async () => {
    const { service, agents } = setup();
    const err = await service.putAgent(WS, 'agent-1', REPO, body([FOREIGN_REPO, 'a.md'])).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(agents.replaced).toEqual([]);
  });

  it('rejects a NEW path that is not in the catalog', async () => {
    const { service, agents } = setup();
    const err = await service.putAgent(WS, 'agent-1', REPO, body([REPO, 'nope.md'])).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(agents.replaced).toEqual([]);
  });

  it('D1: an already-saved pair that left the catalog may stay and be re-ordered', async () => {
    const { service, agents } = setup();
    agents.docs = [ref('stale.md', REPO, 0), ref('a.md', REPO, 1)];
    const view = await service.putAgent(WS, 'agent-1', REPO, body([REPO, 'a.md'], [REPO, 'stale.md']));
    expect(agents.replaced[0]).toEqual([
      { repoId: REPO, path: 'a.md' },
      { repoId: REPO, path: 'stale.md' },
    ]);
    expect(view.own.map((d) => [d.path, d.status])).toEqual([
      ['a.md', 'ok'],
      ['stale.md', 'missing'],
    ]);
  });

  it('404 for an agent outside the workspace', async () => {
    const { service } = setup();
    await expect(service.putAgent(WS, 'ghost', REPO, body())).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getAgentView(WS, 'ghost', REPO)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('saves the full ordered list across repos and returns the view for the active repo (AC-3, EC-18)', async () => {
    const { service, agents } = setup();
    const view = await service.putAgent(WS, 'agent-1', REPO, body([OTHER_REPO, 'x.md'], [REPO, 'b.md'], [REPO, 'a.md']));
    expect(agents.replaced[0]!.map((d) => d.path)).toEqual(['x.md', 'b.md', 'a.md']);
    expect(view.repo_id).toBe(REPO);
    expect(view.own.map((d) => [d.repo_id === REPO ? 'here' : 'other', d.path, d.position])).toEqual([
      ['other', 'x.md', 0],
      ['here', 'b.md', 1],
      ['here', 'a.md', 2],
    ]);
    expect(view.total_est_tokens).toBe(300);
  });
});

describe('getAgentView (AC-11, AC-12, AC-14, AC-15, AC-20, EC-10)', () => {
  it('marks a path missing from the catalog with null category / estimate (AC-15)', async () => {
    const { service, agents } = setup();
    agents.docs = [ref('gone.md')];
    const view = await service.getAgentView(WS, 'agent-1', REPO);
    expect(view.own[0]).toMatchObject({ status: 'missing', category: null, est_tokens: null, would_skip: null });
  });

  it('asks the catalog once per repo', async () => {
    const { service, agents, catalog } = setup();
    agents.docs = [ref('a.md'), ref('b.md'), ref('x.md', OTHER_REPO)];
    await service.getAgentView(WS, 'agent-1', REPO);
    expect([...catalog.getCatalogCalls].sort()).toEqual([OTHER_REPO, REPO].sort());
  });

  it('lists inherited docs in skill order with activity, reason and duplicate flags', async () => {
    const { service, agents, skills } = setup();
    agents.docs = [ref('a.md')];
    skills.linked = [
      { id: 's1', name: 'One', order: 0, enabled: true, safe: true },
      { id: 's2', name: 'Two', order: 1, enabled: false, safe: true },
      { id: 's3', name: 'Three', order: 2, enabled: true, safe: false },
      { id: 's4', name: 'Four', order: 3, enabled: true, safe: true },
    ];
    skills.docs = [
      sref('s1', 'a.md', 0),
      sref('s1', 'b.md', 1),
      sref('s2', 'c.md', 0),
      sref('s3', 'c.md', 0),
      sref('s4', 'b.md', 0),
      sref('s4', 'c.md', 1),
    ];
    const view = await service.getAgentView(WS, 'agent-1', REPO);
    expect(view.inherited.map((d) => [d.skill_name, d.path, d.skill_active, d.skill_inactive_reason, d.duplicate])).toEqual([
      ['One', 'a.md', true, null, true],
      ['One', 'b.md', true, null, false],
      ['Two', 'c.md', false, 'disabled', false],
      ['Three', 'c.md', false, 'unsafe', false],
      ['Four', 'b.md', true, null, true],
      ['Four', 'c.md', true, null, false],
    ]);
    // a (own) + b + c counted once each; inactive skills add nothing (EC-10, EC-17).
    expect(view.total_est_tokens).toBe(600);
  });

  it('names what a run would skip as over_budget and keeps going greedily (AC-14)', async () => {
    const { service, agents, catalog } = setup();
    catalog.files.set(REPO, [cdoc('big.md', 7500), cdoc('mid.md', 1000), cdoc('small.md', 400)]);
    agents.docs = [ref('big.md', REPO, 0), ref('mid.md', REPO, 1), ref('small.md', REPO, 2)];
    const view = await service.getAgentView(WS, 'agent-1', REPO);
    expect(view.over_budget).toBe(true);
    expect(view.budget_tokens).toBe(8000);
    expect(view.own.map((d) => d.would_skip)).toEqual([null, 'over_budget', null]);
    expect(view.total_est_tokens).toBe(7900);
  });
});

describe('skill views (AC-10, EC-11)', () => {
  it('an empty selection serializes to "" / 0 and never reads documents', async () => {
    const { service, catalog } = setup();
    const view = await service.getSkillView(WS, 'skill-1', REPO);
    expect(view).toMatchObject({ serialized: '', serialized_est_tokens: 0, own: [] });
    expect(catalog.resolveCalls).toEqual([]);
  });

  it('serializes exactly the block a run would inject, for the selected repo only', async () => {
    const { service, skills } = setup();
    skills.docs = [sref('skill-1', 'a.md', 0), sref('skill-1', 'x.md', 1, OTHER_REPO), sref('skill-1', 'b.md', 2)];
    const view = await service.getSkillView(WS, 'skill-1', REPO);
    expect(view.own).toHaveLength(3);
    expect(view.serialized.startsWith('## Project context')).toBe(true);
    expect(view.serialized).toContain('### a.md');
    expect(view.serialized).toContain('### b.md');
    expect(view.serialized).not.toContain('x.md');
    expect(view.serialized_est_tokens).toBe(200);
  });

  it('degrades to an empty preview when documents cannot be read', async () => {
    const { service, skills, catalog } = setup();
    skills.docs = [sref('skill-1', 'a.md', 0)];
    catalog.resolveError = new ContextUnavailableError('no_clone');
    const view = await service.getSkillView(WS, 'skill-1', REPO);
    expect(view.serialized).toBe('');
    expect(view.own).toHaveLength(1);
  });

  it('putSkill validates like putAgent and 404s a foreign skill', async () => {
    const { service, skills } = setup();
    await expect(service.putSkill(WS, 'ghost', REPO, body())).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.putSkill(WS, 'skill-1', REPO, body([REPO, 'a.md'], [REPO, 'a.md']))).rejects.toBeInstanceOf(
      ValidationError,
    );
    const view = await service.putSkill(WS, 'skill-1', REPO, body([REPO, 'b.md']));
    expect(skills.docs.map((d) => d.path)).toEqual(['b.md']);
    expect(view.own[0]!.path).toBe('b.md');
  });
});

describe('resolveForRun (AC-19..AC-24, EC-5, EC-18)', () => {
  const input = (injected: { id: string; name: string }[] = []) => ({
    workspaceId: WS,
    agentId: 'agent-1',
    repoId: REPO,
    injectedSkills: injected,
  });

  it('none when nothing is attached for the PR repository (EC-24, AC-21)', async () => {
    const { service, agents, catalog } = setup();
    agents.docs = [ref('x.md', OTHER_REPO)];
    expect(await service.resolveForRun(input())).toEqual({ kind: 'none' });
    expect(catalog.resolveCalls).toEqual([]);
  });

  it('uses only the injected skills; attachments of others are never read (AC-20)', async () => {
    const { service, agents, skills, catalog } = setup();
    agents.docs = [ref('a.md')];
    skills.docs = [sref('s-in', 'b.md', 0), sref('s-out', 'c.md', 0)];
    const res = await service.resolveForRun(input([{ id: 's-in', name: 'In' }]));
    expect(skills.listForSkillsCalls).toEqual([['s-in']]);
    expect(catalog.resolveCalls).toEqual([['a.md', 'b.md']]);
    expect(res.kind === 'resolved' && res.docs.map((d) => d.path)).toEqual(['a.md', 'b.md']);
  });

  it('orders own first, dedups to the first position and records source / skill (AC-19)', async () => {
    const { service, agents, skills, catalog } = setup();
    agents.docs = [ref('b.md', REPO, 0), ref('a.md', REPO, 1)];
    skills.docs = [sref('s1', 'a.md', 0), sref('s1', 'c.md', 1)];
    const res = await service.resolveForRun(input([{ id: 's1', name: 'One' }]));
    expect(catalog.resolveCalls).toEqual([['b.md', 'a.md', 'c.md']]);
    if (res.kind !== 'resolved') throw new Error('expected resolved');
    expect(res.docs.map((d) => d.path)).toEqual(['b.md', 'a.md', 'c.md']);
    expect(res.trace.docs).toEqual([
      { path: 'b.md', source: 'agent', skill_name: null, est_tokens: 100, status: 'injected', reason: null },
      { path: 'a.md', source: 'agent', skill_name: null, est_tokens: 100, status: 'injected', reason: null },
      { path: 'a.md', source: 'skill', skill_name: 'One', est_tokens: 100, status: 'skipped', reason: 'duplicate' },
      { path: 'c.md', source: 'skill', skill_name: 'One', est_tokens: 100, status: 'injected', reason: null },
    ]);
    expect(res.trace).toMatchObject({ sha: 'a'.repeat(40), budget_tokens: 8000, total_est_tokens: 300 });
    expect(res.allReadsFailed).toBe(false);
  });

  it('skips unreadable statuses with their reason and flags all-failed (AC-23)', async () => {
    const { service, agents, catalog } = setup();
    agents.docs = [ref('a.md', REPO, 0), ref('b.md', REPO, 1), ref('c.md', REPO, 2)];
    catalog.resolved = {
      'a.md': { status: 'missing', text: null, estTokens: null },
      'b.md': { status: 'too_large', text: null },
      'c.md': { status: 'unreadable', text: null },
    };
    const res = await service.resolveForRun(input());
    if (res.kind !== 'resolved') throw new Error('expected resolved');
    expect(res.docs).toEqual([]);
    expect(res.trace.docs.map((d) => [d.status, d.reason])).toEqual([
      ['skipped', 'missing'],
      ['skipped', 'too_large'],
      ['skipped', 'unreadable'],
    ]);
    expect(res.allReadsFailed).toBe(true);
  });

  it('skips over-budget documents whole and continues (AC-22) and reports secret paths (AC-29)', async () => {
    const { service, agents, catalog } = setup();
    agents.docs = [ref('a.md', REPO, 0), ref('b.md', REPO, 1), ref('c.md', REPO, 2)];
    catalog.resolved = {
      'a.md': { estTokens: 7000 },
      'b.md': { estTokens: 2000 },
      'c.md': { estTokens: 900, secretWarning: true },
    };
    const res = await service.resolveForRun(input());
    if (res.kind !== 'resolved') throw new Error('expected resolved');
    expect(res.docs.map((d) => d.path)).toEqual(['a.md', 'c.md']);
    expect(res.trace.docs.map((d) => d.reason)).toEqual([null, 'over_budget', null]);
    expect(res.trace.total_est_tokens).toBe(7900);
    expect(res.secretPaths).toEqual(['c.md']);
    expect(res.allReadsFailed).toBe(false);
  });

  it('empty documents are injected with empty text', async () => {
    const { service, agents, catalog } = setup();
    agents.docs = [ref('empty.md')];
    catalog.resolved = { 'empty.md': { status: 'empty', text: '', estTokens: 0 } };
    const res = await service.resolveForRun(input());
    expect(res.kind === 'resolved' && res.docs).toEqual([{ path: 'empty.md', text: '' }]);
  });

  it.each([
    ['no_clone', new ContextUnavailableError('no_clone'), 'no_clone'],
    ['no_catalog', new ContextUnavailableError('no_catalog'), 'no_catalog'],
    ['unexpected error', new Error('db down'), 'error'],
  ])('%s degrades to unavailable, never throws (AC-24)', async (_n, error, reason) => {
    const { service, agents, catalog } = setup();
    agents.docs = [ref('a.md')];
    catalog.resolveError = error;
    expect(await service.resolveForRun(input())).toEqual({ kind: 'unavailable', reason });
  });

  it('a store failure degrades too', async () => {
    const { service, agents } = setup();
    agents.listContextDocs = async () => {
      throw new Error('db down');
    };
    expect(await service.resolveForRun(input())).toEqual({ kind: 'unavailable', reason: 'error' });
  });

  it('gives up after 5 s (AC-24)', async () => {
    vi.useFakeTimers();
    const { service, agents, catalog } = setup();
    agents.docs = [ref('a.md')];
    catalog.resolveHangs = true;
    const pending = service.resolveForRun(input());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual({ kind: 'unavailable', reason: 'timeout' });
  });

  it('never logs document text (NFR-7)', async () => {
    const { service, agents, skills } = setup();
    agents.docs = [ref('a.md')];
    skills.docs = [];
    const lines: string[] = [];
    const logger = {
      info: (o: object, m?: string) => lines.push(JSON.stringify([o, m])),
      warn: (o: object, m?: string) => lines.push(JSON.stringify([o, m])),
    };
    await service.resolveForRun(input(), logger);
    await service.getAgentView(WS, 'agent-1', REPO, logger);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain('text of');
  });
});

describe('resolveForRepo (AC-38, AC-39, AC-41, AC-42)', () => {
  it('merges agents in listed order, own before skills, dedup by first position', async () => {
    const { service, agents, skills, catalog } = setup();
    agents.enabled = [{ id: 'ag-1' }, { id: 'ag-2' }];
    agents.byAgent = {
      'ag-1': [ref('b.md', REPO, 0), ref('x.md', OTHER_REPO, 1)],
      'ag-2': [ref('a.md', REPO, 0), ref('b.md', REPO, 1)],
    };
    skills.linkedByAgent = { 'ag-1': [{ id: 's1', name: 'One', order: 0, enabled: true, safe: true }] };
    skills.docs = [sref('s1', 'c.md', 0), sref('s1', 'a.md', 1)];
    const res = await service.resolveForRepo(WS, REPO);
    expect(catalog.resolveCalls).toEqual([['b.md', 'c.md', 'a.md']]);
    expect(res.kind === 'resolved' && res.docs.map((d) => d.path)).toEqual(['b.md', 'c.md', 'a.md']);
    expect(res.kind === 'resolved' && res.sha).toBe('a'.repeat(40));
  });

  it('excludes disabled and unsafe skills', async () => {
    const { service, agents, skills, catalog } = setup();
    agents.enabled = [{ id: 'ag-1' }];
    agents.byAgent = { 'ag-1': [ref('a.md')] };
    skills.linkedByAgent = {
      'ag-1': [
        { id: 'off', name: 'Off', order: 0, enabled: false, safe: true },
        { id: 'bad', name: 'Bad', order: 1, enabled: true, safe: false },
        { id: 'ok', name: 'Ok', order: 2, enabled: true, safe: true },
      ],
    };
    skills.docs = [sref('off', 'b.md', 0), sref('bad', 'c.md', 0), sref('ok', 'empty.md', 0)];
    const res = await service.resolveForRepo(WS, REPO);
    expect(catalog.resolveCalls).toEqual([['a.md', 'empty.md']]);
    expect(skills.listForSkillsCalls).toEqual([['ok']]);
    expect(res.kind).toBe('resolved');
  });

  it('drops unreadable documents but keeps readable ones', async () => {
    const { service, agents, catalog } = setup();
    agents.enabled = [{ id: 'ag-1' }];
    agents.byAgent = { 'ag-1': [ref('a.md', REPO, 0), ref('b.md', REPO, 1)] };
    catalog.resolved = { 'a.md': { status: 'too_large', text: null } };
    const res = await service.resolveForRepo(WS, REPO);
    expect(res.kind === 'resolved' && res.docs.map((d) => d.path)).toEqual(['b.md']);
  });

  it('never returns documents flagged as containing a secret', async () => {
    const { service, agents, catalog } = setup();
    agents.enabled = [{ id: 'ag-1' }];
    agents.byAgent = { 'ag-1': [ref('a.md', REPO, 0), ref('s.md', REPO, 1)] };
    catalog.resolved = { 's.md': { secretWarning: true } };
    const res = await service.resolveForRepo(WS, REPO);
    expect(res.kind === 'resolved' && res.docs.map((d) => d.path)).toEqual(['a.md']);
  });

  it('no catalog + no attachments -> no_catalog (not none)', async () => {
    const { service, catalog } = setup();
    catalog.resolveError = new ContextUnavailableError('no_catalog');
    expect(await service.resolveForRepo(WS, REPO)).toEqual({ kind: 'unavailable', reason: 'no_catalog' });
    expect(catalog.resolveCalls).toEqual([[]]);
  });

  it('no clone + no attachments -> no_clone', async () => {
    const { service, catalog } = setup();
    catalog.resolveError = new ContextUnavailableError('no_clone');
    expect(await service.resolveForRepo(WS, REPO)).toEqual({ kind: 'unavailable', reason: 'no_clone' });
  });

  it('catalog exists + no attachments -> none', async () => {
    const { service } = setup();
    expect(await service.resolveForRepo(WS, REPO)).toEqual({ kind: 'none' });
  });

  it('unexpected error -> error; hang -> timeout', async () => {
    vi.useFakeTimers();
    const { service, agents, catalog } = setup();
    agents.enabled = [{ id: 'ag-1' }];
    agents.byAgent = { 'ag-1': [ref('a.md')] };
    catalog.resolveError = new Error('db down');
    expect(await service.resolveForRepo(WS, REPO)).toEqual({ kind: 'unavailable', reason: 'error' });
    catalog.resolveError = null;
    catalog.resolveHangs = true;
    const pending = service.resolveForRepo(WS, REPO);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual({ kind: 'unavailable', reason: 'timeout' });
  });
});
