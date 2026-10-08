import { describe, it, expect, vi } from 'vitest';

describe('TiktokenTokenizer', () => {
  it('counts cl100k tokens for real text', async () => {
    const { TiktokenTokenizer } = await import('../src/adapters/tokenizer/index.js');
    const n = new TiktokenTokenizer().count('hello world');
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan('hello world'.length);
  });

  it('falls back to ceil(chars/4) when the encoder fails to load', async () => {
    vi.resetModules();
    vi.doMock('js-tiktoken', () => ({
      getEncoding: () => {
        throw new Error('no ranks');
      },
    }));
    const { TiktokenTokenizer } = await import('../src/adapters/tokenizer/index.js');
    const t = new TiktokenTokenizer();
    expect(t.count('hello world')).toBe(Math.ceil('hello world'.length / 4));
    // Sticky: stays on the heuristic after the first failure.
    expect(t.count('abcdefghi')).toBe(3);
    vi.doUnmock('js-tiktoken');
    vi.resetModules();
  });
});
