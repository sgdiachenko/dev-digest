import { describe, it, expect } from 'vitest';
import { ContextCatalog, ContextDoc, IndexStatus, SpecFile } from '@devdigest/shared';

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
});
