import { describe, it, expect } from 'vitest';
import { rewriteLinks } from '../src/modules/onboarding/narrative/markdown-links.js';
import { checkFlowchart } from '../src/modules/onboarding/narrative/mermaid.js';

const paths = new Set(['src/a.ts', 'README.md', 'docs/my file (1).md']);

describe('rewriteLinks', () => {
  it('links known paths in inline code and plain text', () => {
    expect(rewriteLinks('Read `src/a.ts` then README.md.', paths)).toBe(
      'Read [src/a.ts](repo:src/a.ts) then [README.md](repo:README.md).',
    );
  });

  it('leaves unknown paths as plain text', () => {
    expect(rewriteLinks('See `src/redis.ts` and src/nope.ts', paths)).toBe(
      'See `src/redis.ts` and src/nope.ts',
    );
  });

  it('reduces arbitrary links and images to their text', () => {
    expect(rewriteLinks('[click](https://evil.test) ![i](http://x/y.png) [r](repo:fake)', paths)).toBe(
      'click i r',
    );
    expect(rewriteLinks('[ref][1]\n\n[1]: http://evil.test', paths).trim()).toBe('[ref][1]');
  });

  it('keeps a known path inside a stripped link text linkable, never the URL', () => {
    expect(rewriteLinks('[src/a.ts](javascript:alert(1))', paths)).toBe('[src/a.ts](repo:src/a.ts)');
  });

  it('does not touch fenced code and leaves HTML untouched', () => {
    const md = '```\nsrc/a.ts\n```\n<b>x</b>';
    expect(rewriteLinks(md, paths)).toBe(md);
  });

  it('encodes parentheses and spaces in the href', () => {
    expect(rewriteLinks('`docs/my file (1).md`', paths)).toBe(
      '[docs/my file (1).md](repo:docs/my%20file%20%281%29.md)',
    );
  });
});

describe('checkFlowchart', () => {
  it('accepts a small flowchart', () => {
    const src = 'flowchart LR\n  A["client: app"] --> B[server]\n  B --> C';
    expect(checkFlowchart(src)).toBe(src);
  });

  it('rejects non-flowchart diagrams, fences, click and init directives', () => {
    expect(checkFlowchart('sequenceDiagram\n A->>B: x')).toBeNull();
    expect(checkFlowchart('flowchart TD\n A --> B\n click A call alert()')).toBeNull();
    expect(checkFlowchart('flowchart TD\n%%{init: {"securityLevel":"loose"}}%%\n A --> B')).toBeNull();
    expect(checkFlowchart('```\nflowchart TD\nA-->B\n```')).toBeNull();
    expect(checkFlowchart(null)).toBeNull();
    expect(checkFlowchart('')).toBeNull();
  });

  it('rejects more than 20 nodes and accepts exactly 20', () => {
    const chain = (n: number): string =>
      'flowchart TD\n' +
      Array.from({ length: n - 1 }, (_, i) => `  N${i} --> N${i + 1}`).join('\n');
    expect(checkFlowchart(chain(20))).not.toBeNull();
    expect(checkFlowchart(chain(21))).toBeNull();
  });
});
