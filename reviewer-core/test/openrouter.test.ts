import { describe, it, expect, vi } from 'vitest';
import OpenAI from 'openai';
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

describe('OpenRouterProvider.completeStructured routing / retries (T32)', () => {
  const base = { model: 'm', messages: [], schema: Schema, schemaName: 's', maxRetries: 0 } as const;
  const ok = { content: '{"verdict":"a","score":1}', finish_reason: 'stop' };

  it('sends provider.require_parameters only with the flag on openrouter', async () => {
    const a = providerReplying([ok]);
    await a.provider.completeStructured({ ...base, requireStructuredProviders: true });
    expect(a.create.mock.calls[0]![0]).toMatchObject({ provider: { require_parameters: true } });

    const b = providerReplying([ok]);
    await b.provider.completeStructured({ ...base });
    expect(b.create.mock.calls[0]![0]).not.toHaveProperty('provider');
  });

  it('passes per-request maxRetries:0 and timeout; omits them by default', async () => {
    const a = providerReplying([ok]);
    await a.provider.completeStructured({ ...base, httpRetries: 0, timeoutMs: 60_000 });
    expect(a.create.mock.calls[0]![1]).toEqual({ maxRetries: 0, timeout: 60_000 });

    const b = providerReplying([ok]);
    await b.provider.completeStructured({ ...base });
    expect(b.create.mock.calls[0]![1]).toEqual({});
  });

  it('maps a no-endpoint APIError to NoEligibleProviderError, but not other errors', async () => {
    const a = providerReplying([ok]);
    a.create.mockRejectedValueOnce(
      OpenAI.APIError.generate(404, { error: { message: 'No endpoints found that can handle the requested parameters' } }, undefined, {}),
    );
    await expect(a.provider.completeStructured({ ...base })).rejects.toMatchObject({
      name: 'NoEligibleProviderError',
    });

    const b = providerReplying([ok]);
    b.create.mockRejectedValueOnce(OpenAI.APIError.generate(404, { error: { message: 'model not found' } }, undefined, {}));
    await expect(b.provider.completeStructured({ ...base })).rejects.not.toMatchObject({
      name: 'NoEligibleProviderError',
    });
  });

  it('does not mistake an ordinary bad-request mentioning "requested parameters" for a missing endpoint', async () => {
    const a = providerReplying([ok]);
    a.create.mockRejectedValueOnce(
      OpenAI.APIError.generate(400, { error: { message: 'Invalid value in the requested parameters: max_tokens' } }, undefined, {}),
    );
    await expect(a.provider.completeStructured({ ...base })).rejects.not.toMatchObject({
      name: 'NoEligibleProviderError',
    });
  });

  it('maps an HTTP-200 no-choices body with the no-endpoint message', async () => {
    const a = providerReplying([ok]);
    a.create.mockResolvedValueOnce({ error: { message: 'No endpoints found for x' } } as never);
    await expect(a.provider.completeStructured({ ...base })).rejects.toMatchObject({
      name: 'NoEligibleProviderError',
    });
  });
});
