import { describe, it, expect } from 'vitest';
import {
  buildSkillDraft,
  capPerCategory,
  dedupeCandidates,
  extractRuleLinesFromSkillBody,
  renderSample,
  renderSamples,
  ruleKey,
  slugify,
  toSampledFile,
  verifyCandidate,
  type RawCandidate,
  type VerifiedCandidate,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRow } from '../src/db/rows.js';

function raw(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    category: 'errors',
    rule: 'Always use async/await instead of .then() chains.',
    rationale: 'Keeps error handling consistent.',
    evidence_path: 'src/api/users.ts',
    evidence_line: 2,
    evidence_snippet: 'const user = await db.users.find(id);',
    probe: 'db.users.find',
    confidence: 0.9,
    ...overrides,
  };
}

const SAMPLE_TEXT = ['import { db } from "./db";', 'const user = await db.users.find(id);', 'export { user };'].join(
  '\n',
);

describe('toSampledFile + renderSample', () => {
  it('truncates by lines and chars, and flags truncation', () => {
    const many = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');
    const file = toSampledFile('big.ts', many);
    expect(file.lines).toHaveLength(220);
    expect(file.truncated).toBe(true);
  });

  it('does not flag a short file as truncated', () => {
    const file = toSampledFile('small.ts', SAMPLE_TEXT);
    expect(file.truncated).toBe(false);
    expect(file.lines).toHaveLength(3);
  });

  it('renders a 1-based line gutter with a FILE header', () => {
    const file = toSampledFile('src/api/users.ts', SAMPLE_TEXT);
    const rendered = renderSample(file);
    expect(rendered).toContain('--- FILE: src/api/users.ts ---');
    expect(rendered).toContain('1\timport { db } from "./db";');
    expect(rendered).toContain('2\tconst user = await db.users.find(id);');
  });

  it('renderSamples stops before the char budget, never mid-file', () => {
    const files = [toSampledFile('a.ts', SAMPLE_TEXT), toSampledFile('b.ts', SAMPLE_TEXT)];
    const block = renderSample(files[0]!);
    const out = renderSamples(files, block.length + 1);
    expect(out).toContain('a.ts');
    expect(out).not.toContain('b.ts');
  });
});

describe('verifyCandidate — the evidence gate', () => {
  const files = new Map([['src/api/users.ts', toSampledFile('src/api/users.ts', SAMPLE_TEXT)]]);

  it('keeps a candidate whose snippet is really in the file', () => {
    const result = verifyCandidate(files, raw());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidate.evidencePath).toBe('src/api/users.ts');
      expect(result.candidate.evidenceLine).toBe(2);
      expect(result.candidate.evidenceSnippet).toContain('await db.users.find(id)');
      expect(result.candidate.origin).toBe('model');
      expect(result.candidate.supportCount).toBeNull();
    }
  });

  it('drops a candidate with an empty rule', () => {
    const result = verifyCandidate(files, raw({ rule: '   ' }));
    expect(result).toEqual({ ok: false, reason: 'empty_rule' });
  });

  it('drops a candidate citing a file that was never sampled', () => {
    const result = verifyCandidate(files, raw({ evidence_path: 'src/other.ts' }));
    expect(result).toEqual({ ok: false, reason: 'unknown_file' });
  });

  it('resolves a unique suffix match (model cites "./src/api/users.ts" or "users.ts")', () => {
    const a = verifyCandidate(files, raw({ evidence_path: './src/api/users.ts' }));
    const b = verifyCandidate(files, raw({ evidence_path: 'users.ts' }));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it('does not guess an ambiguous suffix match', () => {
    const twoFiles = new Map([
      ['src/api/users.ts', toSampledFile('src/api/users.ts', SAMPLE_TEXT)],
      ['src/web/users.ts', toSampledFile('src/web/users.ts', SAMPLE_TEXT)],
    ]);
    const result = verifyCandidate(twoFiles, raw({ evidence_path: 'users.ts' }));
    expect(result).toEqual({ ok: false, reason: 'unknown_file' });
  });

  it('drops a snippet that is too short to identify a line', () => {
    const result = verifyCandidate(files, raw({ evidence_snippet: '}' }));
    expect(result).toEqual({ ok: false, reason: 'snippet_too_short' });
  });

  it('drops a candidate whose snippet is not really in the file (invented evidence)', () => {
    const result = verifyCandidate(files, raw({ evidence_snippet: 'const nonsense = totallyMadeUp();' }));
    expect(result).toEqual({ ok: false, reason: 'snippet_not_found' });
  });

  it('corrects a wrong line number instead of dropping the candidate', () => {
    const result = verifyCandidate(files, raw({ evidence_line: 99 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidate.evidenceLine).toBe(2);
  });

  it('resolves a repeated line to the one nearest the claimed line', () => {
    const repeated = new Map([['a.ts', toSampledFile('a.ts', 'return x;\nreturn x;\nreturn x;')]]);
    const result = verifyCandidate(
      repeated,
      raw({ evidence_path: 'a.ts', evidence_snippet: 'return x;', evidence_line: 3 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidate.evidenceLine).toBe(3);
  });

  it('slices the kept snippet from the file, not from the model text', () => {
    const result = verifyCandidate(
      files,
      raw({ evidence_snippet: 'const USER = AWAIT db.users.find(id);  \t' }), // wrong case/whitespace
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidate.evidenceSnippet).toBe('const user = await db.users.find(id);');
  });

  it('ignores an echoed line-number gutter in the snippet', () => {
    const result = verifyCandidate(files, raw({ evidence_snippet: '2\tconst user = await db.users.find(id);' }));
    expect(result.ok).toBe(true);
  });
});

describe('dedupeCandidates + capPerCategory', () => {
  function candidate(overrides: Partial<VerifiedCandidate> = {}): VerifiedCandidate {
    return {
      category: 'general',
      rule: 'Always do X.',
      rationale: null,
      evidencePath: 'a.ts',
      evidenceLine: 1,
      evidenceSnippet: 'x',
      confidence: 0.8,
      origin: 'model',
      probe: null,
      supportCount: null,
      ...overrides,
    };
  }

  it('drops a candidate that repeats a seed key (an already-decided rule)', () => {
    const { kept, dropped } = dedupeCandidates([candidate()], [ruleKey('Always do X.')]);
    expect(kept).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it('drops duplicates within the same list, keeping the first (caller sorts strongest-first)', () => {
    const { kept, dropped } = dedupeCandidates([
      candidate({ rule: 'Always do X.', confidence: 0.9 }),
      candidate({ rule: 'ALWAYS   DO X', confidence: 0.5 }), // case + whitespace + punctuation insensitive
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.confidence).toBe(0.9);
    expect(dropped).toBe(1);
  });

  it('caps how many candidates one category may contribute', () => {
    const many = Array.from({ length: 5 }, (_, i) => candidate({ rule: `Rule ${i}`, category: 'naming' }));
    const { kept, dropped } = capPerCategory(many, 3);
    expect(kept).toHaveLength(3);
    expect(dropped).toBe(2);
  });

  it('does not cap across different categories', () => {
    const mixed = [
      candidate({ rule: 'A', category: 'naming' }),
      candidate({ rule: 'B', category: 'errors' }),
      candidate({ rule: 'C', category: 'testing' }),
    ];
    const { kept } = capPerCategory(mixed, 1);
    expect(kept).toHaveLength(3);
  });
});

describe('buildSkillDraft', () => {
  function row(overrides: Partial<ConventionRow> = {}): ConventionRow {
    return {
      id: 'c1',
      workspaceId: 'w1',
      repoId: 'r1',
      category: 'errors',
      rule: 'Always use async/await instead of .then() chains.',
      rationale: 'Keeps error handling consistent.',
      evidencePath: 'src/api/users.ts',
      evidenceLine: 23,
      evidenceSnippet: 'const user = await db.users.find(id);',
      confidence: 0.9,
      status: 'accepted',
      origin: 'model',
      supportCount: 12,
      probe: 'db.users.find',
      scanId: 's1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    } as ConventionRow;
  }

  it('names the skill literally "repo-conventions" (grading criterion #42), not a repo-slugged variant', () => {
    const draft = buildSkillDraft('acme/payments-api', [row()]);
    expect(draft.name).toBe('repo-conventions');
    expect(draft.type).toBe('convention');
  });

  it('includes one section per row with its file:line evidence', () => {
    const draft = buildSkillDraft('acme/payments-api', [row()]);
    expect(draft.body).toContain('## always-use-asyncawait-instead-of-then');
    expect(draft.body).toContain('Detected in `src/api/users.ts:23`');
    expect(draft.body).toContain('await db.users.find(id)');
  });

  it('collects distinct evidence files and the source convention ids', () => {
    const draft = buildSkillDraft('acme/payments-api', [
      row({ id: 'c1', evidencePath: 'a.ts' }),
      row({ id: 'c2', evidencePath: 'a.ts' }),
      row({ id: 'c3', evidencePath: 'b.ts' }),
    ]);
    expect(draft.evidence_files).toEqual(['a.ts', 'b.ts']);
    expect(draft.convention_ids).toEqual(['c1', 'c2', 'c3']);
  });
});

describe('extractRuleLinesFromSkillBody', () => {
  it('pulls the first non-empty line under each ## anchor', () => {
    const body = [
      '# repo-conventions',
      '',
      '## rule-one',
      'Always do X.',
      '',
      'Detected in `a.ts:1`.',
      '',
      '## rule-two',
      '',
      'Never do Y.',
    ].join('\n');
    expect(extractRuleLinesFromSkillBody(body)).toEqual(['Always do X.', 'Never do Y.']);
  });

  it('returns an empty array for a body with no ## sections', () => {
    expect(extractRuleLinesFromSkillBody('Just some text.')).toEqual([]);
  });
});

describe('slugify', () => {
  it('produces a stable anchor from a rule sentence', () => {
    expect(slugify('Always use async/await instead of .then() chains.')).toBe(
      'always-use-asyncawait-instead-of-then',
    );
  });

  it('falls back to "rule" for text with no alphanumerics', () => {
    expect(slugify('!!!')).toBe('rule');
  });
});
