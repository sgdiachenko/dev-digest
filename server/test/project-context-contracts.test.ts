import { describe, it, expect } from 'vitest';
import {
  ContextAttachmentsBody,
  ContextCatalog,
  ContextDoc,
  IndexStatus,
  RunTrace,
  SpecFile,
} from '@devdigest/shared';

const doc = {
  path: 'docs/a.md',
  category: 'docs',
  size: 10,
  est_tokens: 3,
  status: 'ok',
  secret_warning: false,
  used_by: null,
};

const catalog = {
  repo_id: 'r1',
  status: 'ready',
  branch: 'main',
  scanned_sha: 'a'.repeat(40),
  scanned_at: '2026-09-30T10:00:00.000Z',
  total_files: 1,
  truncated: false,
  error: null,
  files: [doc],
};

describe('project-context contracts', () => {
  it('parses a catalog with used_by null', () => {
    expect(ContextCatalog.parse(catalog).files[0]!.used_by).toBeNull();
  });

  it('parses used_by with agents and skills', () => {
    const used_by = { agents: [{ id: 'a1', name: 'Agent' }], skills: [{ id: 's1', name: 'Skill' }] };
    expect(ContextDoc.parse({ ...doc, used_by }).used_by).toEqual(used_by);
  });

  it('rejects negative est_tokens', () => {
    expect(ContextDoc.safeParse({ ...doc, est_tokens: -1 }).success).toBe(false);
  });

  it('accepts null est_tokens', () => {
    expect(ContextDoc.safeParse({ ...doc, est_tokens: null, status: 'too_large' }).success).toBe(true);
  });

  it('keeps SpecFile and IndexStatus fixtures parsing', () => {
    expect(SpecFile.safeParse({ path: 'a.md', content: null, size: 1, updated_at: null }).success).toBe(true);
    expect(IndexStatus.safeParse({ status: 'done', pct: 100, message: null, chunks_indexed: 3 }).success).toBe(true);
  });

  describe('attachments and trace', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const baseTrace = {
      config: { agent: 'a', model: 'm' },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: 'x' },
      prompt_assembly: { system: '', user: '' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: [],
    };

    it('accepts up to 20 attachments and rejects 21', () => {
      const mk = (n: number) => ({
        docs: Array.from({ length: n }, (_, i) => ({ repo_id: uuid, path: `docs/${i}.md` })),
      });
      expect(ContextAttachmentsBody.safeParse(mk(20)).success).toBe(true);
      expect(ContextAttachmentsBody.safeParse(mk(21)).success).toBe(false);
    });

    it('rejects unknown keys in body and refs (.strict)', () => {
      expect(ContextAttachmentsBody.safeParse({ docs: [], extra: 1 }).success).toBe(false);
      expect(
        ContextAttachmentsBody.safeParse({ docs: [{ repo_id: uuid, path: 'a.md', extra: 1 }] }).success,
      ).toBe(false);
    });

    it('parses a RunTrace without project_context (old trace)', () => {
      const r = RunTrace.safeParse(baseTrace);
      expect(r.success).toBe(true);
    });

    it('parses project_context and rejects a bad skip reason', () => {
      const pc = {
        sha: 'a'.repeat(40),
        budget_tokens: 12000,
        total_est_tokens: 10,
        docs: [
          { path: 'a.md', source: 'agent', skill_name: null, est_tokens: 10, status: 'injected', reason: null },
        ],
      };
      const ok = RunTrace.safeParse({ ...baseTrace, project_context: pc });
      expect(ok.success).toBe(true);
      if (ok.success) expect(ok.data.project_context?.docs[0]?.path).toBe('a.md');
      const bad = { ...pc, docs: [{ ...pc.docs[0], status: 'skipped', reason: 'nope' }] };
      expect(RunTrace.safeParse({ ...baseTrace, project_context: bad }).success).toBe(false);
    });
  });
});
