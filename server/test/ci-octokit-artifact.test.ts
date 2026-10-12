import { describe, it, expect, vi, afterEach } from 'vitest';
import { OctokitGitHubCiClient } from '../src/adapters/github/octokit.js';

/** AC-112 / AC-141 - artifact download: one redirect hop, URL never leaves, 410 -> null. */

const SIGNED = 'https://pipelines.example.invalid/artifact.zip?sig=SECRET-SIGNATURE';
const REPO = { owner: 'acme', name: 'api' } as never;

function client(request: (route: string, params: Record<string, unknown>) => Promise<unknown>) {
  const c = new OctokitGitHubCiClient('tok');
  (c as unknown as { octokit: unknown }).octokit = { request };
  return c;
}

function zipResponse(bytes: number[], status = 200): Response {
  return new Response(new Uint8Array(bytes), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe('OctokitGitHubCiClient.downloadArtifact', () => {
  it('follows the 302 Location exactly once, returns only the bytes and logs nothing', async () => {
    const request = vi.fn(async () => ({ headers: { location: SIGNED } }));
    const fetchMock = vi.fn(async () => zipResponse([1, 2, 3]));
    vi.stubGlobal('fetch', fetchMock);
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));

    const out = await client(request).downloadArtifact(REPO, 7, 1024);

    expect(Array.from(out!)).toEqual([1, 2, 3]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![1]).toMatchObject({ artifact_id: 7, request: { redirect: 'manual' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(SIGNED);
    expect(JSON.stringify(out)).not.toContain('SECRET-SIGNATURE');
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain('SECRET-SIGNATURE');
    spies.forEach((s) => s.mockRestore());
  });

  it('410 from the API -> null, no second request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const request = vi.fn(async () => {
      throw Object.assign(new Error('gone'), { status: 410 });
    });
    expect(await client(request).downloadArtifact(REPO, 7, 1024)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('410 from the redirect target -> null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => zipResponse([], 410)));
    const request = vi.fn(async () => ({ headers: { location: SIGNED } }));
    expect(await client(request).downloadArtifact(REPO, 7, 1024)).toBeNull();
  });

  it('a failing download never carries the URL in the thrown error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(`connect failed ${SIGNED}`); }));
    const request = vi.fn(async () => ({ headers: { location: SIGNED } }));
    const err = await client(request).downloadArtifact(REPO, 7, 1024).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).not.toContain('SECRET-SIGNATURE');
  });
});
