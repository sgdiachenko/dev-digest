/**
 * Keeps every server test hermetic: `loadConfig` resolves the secrets store as
 * `<homedir>/.devdigest/secrets.json`, so without this a developer's real BYO keys
 * (OpenRouter, OpenAI, GitHub) leak into the suite — intent derivation and other LLM
 * calls then hit the real provider, cost real money, and break assertions such as
 * "a run that fails before producing output has cost_usd = null". CI has no such file,
 * so only local runs were affected. Only the inlined `src` modules see the mock;
 * externalized packages (testcontainers, git) keep the real home directory.
 */
import { vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fakeHome = mkdtempSync(join(tmpdir(), 'devdigest-test-home-'));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, default: { ...actual, homedir: () => fakeHome }, homedir: () => fakeHome };
});
