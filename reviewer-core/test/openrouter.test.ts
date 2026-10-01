import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

const Schema = z.object({ verdict: z.string(), score: z.number() });

function providerReplying(contents: Array<{ content: string; finish_reason: string }>) {
  const provider = new OpenRouterProvider('k', { maxRetries: 0 });
  let i = 0;
  const create = vi.fn(async () => {
    const c = contents[Math.min(i++, contents.length - 1)]!;
    return {
      choices: [{ message: { content: c.content }, finish_reason: c.finish_reason }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    };
  });
  (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };
  return { provider, create };
}

describe('OpenRouterProvider.completeStructured', () => {
  it('names finish_reason, raw length and the first validation issue when every attempt fails', async () => {
    const truncated = '{"verdict": "approve", "sco';
    const { provider, create } = providerReplying([{ content: truncated, finish_reason: 'length' }]);

    const err = await provider
      .completeStructured({
        model: 'm',
        messages: [{ role: 'user', content: 'hi' }],
        schema: Schema,
        schemaName: 'intent',
        maxRetries: 1,
      })
      .then(
        () => null,
        (e: Error) => e,
      );

    expect(create).toHaveBeenCalledTimes(2);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain('failed schema validation for intent');
    expect(err!.message).toContain('finish_reason=length');
    expect(err!.message).toContain(`${truncated.length} chars`);
    // detail after the colon is the first line of the validation error, not empty
    expect(err!.message.split('): ')[1]!.length).toBeGreaterThan(0);
    expect(err!.message.split('): ')[1]).not.toContain('\n');
  });

  it('falls back to finish_reason=unknown when the provider sent none', async () => {
    const { provider } = providerReplying([{ content: 'nope', finish_reason: '' }]);
    await expect(
      provider.completeStructured({ model: 'm', messages: [], schema: Schema, schemaName: 's', maxRetries: 0 }),
    ).rejects.toThrow('finish_reason=unknown, 4 chars');
  });
});
