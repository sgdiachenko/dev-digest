import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OpenAIProvider } from '../src/adapters/llm/openai.js';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

const Schema = z.object({ ok: z.boolean() });
const messages = [
  { role: 'system' as const, content: 's' },
  { role: 'user' as const, content: 'u' },
];
const base = { model: 'gpt-4o-mini', schema: Schema, schemaName: 'T', messages, maxRetries: 0 };

const rateLimited = () => Object.assign(new Error('rate limited'), { status: 429 });

const openaiOk = {
  choices: [{ message: { content: '{"ok":true}' } }],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
};
const anthropicOk = {
  content: [{ type: 'tool_use', input: { ok: true } }],
  usage: { input_tokens: 1, output_tokens: 1 },
};

function openai(create: ReturnType<typeof vi.fn>) {
  const p = new OpenAIProvider('k');
  (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
  return p;
}
function anthropic(create: ReturnType<typeof vi.fn>) {
  const p = new AnthropicProvider('k');
  (p as unknown as { client: unknown }).client = { messages: { create } };
  return p;
}

describe.each([
  ['openai', openai, openaiOk],
  ['anthropic', anthropic, anthropicOk],
] as const)('%s completeStructured httpRetries', (_name, make, okRes) => {
  it('httpRetries 0: exactly one call, maxRetries 0 in request options, no withRetry on 429', async () => {
    const create = vi.fn().mockRejectedValue(rateLimited());
    await expect(make(create).completeStructured({ ...base, httpRetries: 0 })).rejects.toMatchObject({ status: 429 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![1]).toEqual({ maxRetries: 0 });
  });

  it('httpRetries 0 on 5xx: still a single call', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { status: 503 }));
    await expect(make(create).completeStructured({ ...base, httpRetries: 0 })).rejects.toMatchObject({ status: 503 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('httpRetries > 0 is passed through as maxRetries', async () => {
    const create = vi.fn().mockResolvedValue(okRes);
    await make(create).completeStructured({ ...base, httpRetries: 2 });
    expect(create.mock.calls[0]![1]).toEqual({ maxRetries: 2 });
  });

  it('unset: withRetry behaviour preserved (retries a 429) and no request options', async () => {
    const create = vi.fn().mockRejectedValueOnce(rateLimited()).mockResolvedValue(okRes);
    const res = await make(create).completeStructured(base);
    expect(res.data).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]![1]).toBeUndefined();
  });
});
