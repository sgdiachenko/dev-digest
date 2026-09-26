import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FetchDevDigestApi } from '../src/api/client.js';
import { ToolError } from '../src/errors.js';
import { makeAgent, makePrMeta } from './fixtures.js';

describe('FetchDevDigestApi', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('parses a valid list response and encodes path segments', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [makeAgent()] })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [makePrMeta()] });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const api = new FetchDevDigestApi('http://localhost:3001');
    const agents = await api.listAgents();
    expect(agents).toEqual([makeAgent()]);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/agents', undefined);

    await api.listPullsForRepo('repo with spaces/slash');
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3001/repos/${encodeURIComponent('repo with spaces/slash')}/pulls`,
      undefined,
    );
  });

  it('turns a network failure into an actionable ToolError', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const api = new FetchDevDigestApi('http://localhost:3001');

    await expect(api.listAgents()).rejects.toThrow(ToolError);
    await expect(api.listAgents()).rejects.toThrow(/scripts\/dev\.sh/);
  });

  it('turns a 429 into a rate-limit ToolError', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }) as unknown as typeof fetch;
    const api = new FetchDevDigestApi('http://localhost:3001');

    await expect(api.listAgents()).rejects.toThrow(/rate limit/i);
  });

  it('turns a malformed body into an actionable ToolError instead of throwing a raw ZodError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ not: 'an array' }),
    }) as unknown as typeof fetch;
    const api = new FetchDevDigestApi('http://localhost:3001');

    await expect(api.listAgents()).rejects.toThrow(ToolError);
    await expect(api.listAgents()).rejects.toThrow(/unexpected response shape/);
  });
});
