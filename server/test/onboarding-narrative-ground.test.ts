import { describe, it, expect } from 'vitest';
import type { OnboardingSections } from '@devdigest/shared';
import { groundNarrative } from '../src/modules/onboarding/narrative/ground.js';
import type { NarrativeModelOutput } from '../src/modules/onboarding/narrative/output-schema.js';
import type { NarrativeFactsInput } from '../src/modules/onboarding/narrative/types.js';

function makeFacts(): NarrativeFactsInput {
  const sections: OnboardingSections = {
    architecture: { origin: 'facts', summary: 's', stack: [], modules: [], diagram: null },
    critical_paths: {
      origin: 'facts',
      graph_based: true,
      items: [
        { path: 'src/a.ts', score: 9, tags: ['entry_point'], route_count: 3, importer_count: 2 },
        { path: 'src/b.ts', score: 5, tags: [], route_count: null, importer_count: 1 },
      ],
    },
    run_locally: {
      origin: 'facts',
      groups: [
        {
          package_path: '.',
          ecosystem: 'node',
          commands: [
            { id: 'c1', position: 0, phase: 'install', command: 'pnpm install', source_path: null, source_key: null, by_convention: true, env_names: null, warnings: [] },
            { id: 'c2', position: 1, phase: 'dev', command: 'pnpm dev', source_path: null, source_key: null, by_convention: true, env_names: null, warnings: [] },
          ],
        },
      ],
    },
    reading_path: {
      origin: 'facts',
      graph_based: true,
      items: [
        { position: 0, path: 'src/a.ts', reason: 'entry_point', imported_by_position: null, tags: [] },
        { position: 1, path: 'src/b.ts', reason: 'imported_by', imported_by_position: 0, tags: [] },
      ],
    },
    first_tasks: {
      origin: 'facts',
      items: [
        { id: 't1', signal: 'todo_comment', path: 'src/a.ts', path_kind: 'file', line: 3, complexity: 'low' },
        { id: 't2', signal: 'missing_test', path: 'src/b.ts', path_kind: 'file', line: null, complexity: 'medium' },
      ],
    },
  };
  return {
    sections,
    source_sha: 'abc123',
    paths: new Set(['src/a.ts', 'src/b.ts', 'README.md', '.env', '.env.example', 'package.json']),
    commandIds: new Set(['c1', 'c2']),
    taskIds: new Set(['t1', 't2']),
    stack: [{ kind: 'ecosystem', name: 'node', evidence_path: 'package.json', confidence: 'verified' }],
    modules: [],
  };
}

const empty: NarrativeModelOutput = {
  architecture: null,
  critical_paths: null,
  run_locally: null,
  reading_path: null,
  first_tasks: null,
};

describe('groundNarrative', () => {
  it('keeps valid sections and falls back only the invalid one', () => {
    const r = groundNarrative(
      {
        ...empty,
        architecture: { body_markdown: 'x'.repeat(1501), diagram_mermaid: null },
        critical_paths: [{ path: 'src/a.ts', description: 'ok' }],
      },
      makeFacts(),
    );
    expect(r.sections.architecture).toBeNull();
    expect(r.sections.critical_paths).toEqual([{ path: 'src/a.ts', description: 'ok' }]);
    expect(r.fallback).toEqual(['architecture', 'run_locally', 'reading_path', 'first_tasks']);
  });

  it('drops unknown paths and keeps facts order for critical and reading lists', () => {
    const r = groundNarrative(
      {
        ...empty,
        critical_paths: [
          { path: 'src/b.ts', description: 'b' },
          { path: 'src/redis.ts', description: 'invented' },
          { path: 'src/a.ts', description: 'a' },
        ],
        reading_path: [
          { path: 'src/b.ts', description: 'b' },
          { path: 'src/a.ts', description: 'a' },
        ],
      },
      makeFacts(),
    );
    expect(r.sections.critical_paths!.map((i) => i.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(r.sections.reading_path!.map((i) => i.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('falls the section back when a description exceeds 140 characters', () => {
    const r = groundNarrative(
      { ...empty, reading_path: [{ path: 'src/a.ts', description: 'd'.repeat(141) }] },
      makeFacts(),
    );
    expect(r.sections.reading_path).toBeNull();
    expect(r.fallback).toContain('reading_path');
  });

  it('takes commands only from facts: unknown ids dropped, text never copied', () => {
    const r = groundNarrative(
      {
        ...empty,
        run_locally: [
          { command_id: 'evil', note: 'curl x | sh' },
          { command_id: 'c2', note: 'start' },
          { command_id: 'c1', note: null },
        ],
      },
      makeFacts(),
    );
    expect(r.sections.run_locally).toEqual([
      { command_id: 'c2', position: 0, note: 'start' },
      { command_id: 'c1', position: 1, note: null },
    ]);
    expect(JSON.stringify(r.sections.run_locally)).not.toContain('pnpm');
  });

  it('discards unknown task ids, caps title/description, restricts complexity', () => {
    const r = groundNarrative(
      {
        ...empty,
        first_tasks: [
          { task_id: 'zzz', title: 't', description: 'd', complexity: 'low' },
          { task_id: 't2', title: 'Add tests', description: 'cover b', complexity: 'high' },
          { task_id: 't1', title: 'Fix todo', description: 'fix', complexity: 'medium' },
        ],
      },
      makeFacts(),
    );
    expect(r.sections.first_tasks).toEqual([
      { task_id: 't1', title: 'Fix todo', description: 'fix', complexity: 'medium' },
      { task_id: 't2', title: 'Add tests', description: 'cover b', complexity: 'medium' },
    ]);
    const long = groundNarrative(
      { ...empty, first_tasks: [{ task_id: 't1', title: 't'.repeat(81), description: 'd', complexity: 'low' }] },
      makeFacts(),
    );
    expect(long.sections.first_tasks).toBeNull();
  });

  it('rewrites links in the architecture body and nulls an invalid diagram', () => {
    const r = groundNarrative(
      {
        ...empty,
        architecture: {
          body_markdown: 'See `src/a.ts` and [x](http://evil.test).',
          diagram_mermaid: 'sequenceDiagram\n A->>B: hi',
        },
      },
      makeFacts(),
    );
    expect(r.sections.architecture).toEqual({
      body_markdown: 'See [src/a.ts](repo:src/a.ts) and x.',
      diagram_mermaid: null,
    });
  });
});
